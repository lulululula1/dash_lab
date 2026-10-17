import ExcelJS from 'exceljs'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildDataset } from './dataset'
import { parseFileBuffer, parseXlsxWithExcelJs, validateFileMeta } from './parse'
import { excelSerialToMs, isDateFormatCode, parseXlsxLite } from './xlsxLite'

const LIMITS = { maxRows: 200_000, maxColumns: 300 }
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships'

/** .NET OpenXML SDK처럼 모든 요소에 x: 접두사를 붙인 XLSX (ExcelJS가 읽지 못하는 형식) */
function prefixedXlsx(): ArrayBuffer {
  const xml = (s: string) => strToU8(`<?xml version="1.0" encoding="utf-8"?>${s}`)
  const zip = zipSync({
    '[Content_Types].xml': xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`),
    '_rels/.rels': xml(`<Relationships xmlns="${REL}"><Relationship Id="R1" Type="${R}/officeDocument" Target="/xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': xml(
      `<x:workbook xmlns:x="${NS}"><x:sheets><x:sheet name="데이터" sheetId="1" r:id="Ra" xmlns:r="${R}"/><x:sheet name="숨김" sheetId="2" state="hidden" r:id="Rb" xmlns:r="${R}"/></x:sheets></x:workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': xml(
      `<Relationships xmlns="${REL}"><Relationship Id="Ra" Type="${R}/worksheet" Target="/xl/worksheets/sheet1.xml"/><Relationship Id="Rb" Type="${R}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="Rs" Type="${R}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="Rt" Type="${R}/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/sharedStrings.xml': xml(`<x:sst xmlns:x="${NS}"><x:si><x:t>부서</x:t></x:si><x:si><x:r><x:t>기</x:t></x:r><x:r><x:t>획</x:t></x:r><x:rPh><x:t>キ</x:t></x:rPh></x:si></x:sst>`),
    'xl/styles.xml': xml(
      `<x:styleSheet xmlns:x="${NS}"><x:numFmts><x:numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/><x:numFmt numFmtId="165" formatCode="#,##0&quot;명&quot;"/></x:numFmts><x:cellXfs><x:xf numFmtId="0"/><x:xf numFmtId="14"/><x:xf numFmtId="164"/><x:xf numFmtId="165"/></x:cellXfs></x:styleSheet>`,
    ),
    'xl/worksheets/sheet1.xml': xml(
      `<x:worksheet xmlns:x="${NS}"><x:sheetData>` +
        `<x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1" t="inlineStr"><x:is><x:t>일자</x:t></x:is></x:c><x:c r="C1" t="inlineStr"><x:is><x:t>인원</x:t></x:is></x:c><x:c r="D1" t="inlineStr"><x:is><x:t>완료</x:t></x:is></x:c></x:row>` +
        `<x:row r="2"><x:c r="A2" t="s"><x:v>1</x:v></x:c><x:c r="B2" s="1"><x:v>45292</x:v></x:c><x:c r="C2" s="3"><x:v>1200</x:v></x:c><x:c r="D2" t="b"><x:v>1</x:v></x:c></x:row>` +
        `<x:row r="4"><x:c r="A4" t="str"><x:f>A2</x:f><x:v>기획</x:v></x:c><x:c r="B4" s="2"><x:v>45658</x:v></x:c><x:c r="C4" t="e"><x:v>#DIV/0!</x:v></x:c></x:row>` +
        `<x:row><x:c t="inlineStr"><x:is><x:t>인사</x:t></x:is></x:c><x:c/><x:c><x:v>0</x:v></x:c></x:row>` +
        `</x:sheetData></x:worksheet>`,
    ),
    'xl/worksheets/sheet2.xml': xml(`<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="B1"><v>7</v></c></row></sheetData></worksheet>`),
  })
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer
}

describe('경량 XLSX 판독기', () => {
  it('ExcelJS는 x: 접두사 형식을 읽지 못한다 (재현)', async () => {
    await expect(new ExcelJS.Workbook().xlsx.load(prefixedXlsx())).rejects.toThrow()
  })

  it('접두사 형식의 값·공유 문자열·서식 텍스트·날짜·불리언·오류·숨김 시트를 읽는다', async () => {
    const [main, hidden] = await parseXlsxLite(prefixedXlsx(), LIMITS)
    expect(main.name).toBe('데이터')
    expect(main.hidden).toBe(false)
    expect(main.rows[0]).toEqual(['부서', '일자', '인원', '완료'])
    expect(main.rows[1]).toEqual(['기획', new Date(Date.UTC(2024, 0, 1)), 1200, true])
    expect(main.rows[2]).toEqual([])
    expect(main.rows[3]).toEqual(['기획', new Date(Date.UTC(2025, 0, 1)), '#DIV/0!'])
    expect(main.rows[4]).toEqual(['인사', null, 0])
    expect(hidden).toMatchObject({ name: '숨김', hidden: true, rows: [[null, 7]] })
  })

  it('parseFileBuffer로 업로드 전 과정이 동작한다', async () => {
    const wb = await parseFileBuffer(prefixedXlsx(), 'prefixed.xlsx')
    expect(wb.sheets.map((s) => s.name)).toEqual(['데이터', '숨김'])
    const ds = buildDataset(wb, 0)
    const [, date, people] = ds.columns
    expect(date.type).toBe('date')
    expect(people.values).toEqual([1200, null, 0])
    expect(people.invalid).toBe(1)
  })

  it('ExcelJS가 읽은 결과와 같은 값을 낸다', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('비교')
    ws.addRow(['제목 행'])
    ws.addRow(['일자', '부서', '인원', '식'])
    ws.addRow([new Date(Date.UTC(2024, 2, 5)), { richText: [{ text: '인' }, { text: '사' }] }, 12.5, { formula: 'C3*2', result: 25 }])
    ws.addRow([new Date(Date.UTC(2023, 11, 31)), '기획', null, { error: '#N/A' }])
    ws.getColumn(1).numFmt = 'yyyy-mm-dd'
    const out = await wb.xlsx.writeBuffer()
    const buf = new Uint8Array(out as ArrayBuffer).slice().buffer
    const viaExcelJs = (await parseXlsxWithExcelJs(buf))[0].rows
    const viaLite = (await parseXlsxLite(buf, LIMITS))[0].rows
    // ExcelJS는 행을 전체 열 수만큼 null로 채우므로 끝의 null을 제거하고 비교한다.
    const trim = (rows: unknown[][]) => rows.map((r) => {
      const c = [...r]
      while (c.length && c[c.length - 1] == null) c.pop()
      return c
    })
    expect(trim(viaLite)).toEqual(trim(viaExcelJs))
    expect(viaLite[2]).toEqual([new Date(Date.UTC(2024, 2, 5)), '인사', 12.5, 25])
  })

  it('CDATA로 감싼 공유 문자열을 읽는다 (ExcelJS는 빈 문자열로 읽음)', async () => {
    const xml = (s: string) => strToU8(`<?xml version="1.0" encoding="UTF-8"?>${s}`)
    // 일부 웹 시스템의 '엑셀 다운로드' 기능은 문자열을 <![CDATA[...]]>로 감싸 저장한다.
    const zip = zipSync({
      'xl/worksheets/sheet1.xml': xml(`<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>5</v></c></row></sheetData></worksheet>`),
      'xl/sharedStrings.xml': xml(`<sst xmlns="${NS}"><si><t><![CDATA[항목]]></t></si><si><t><![CDATA[값]]></t></si><si><t><![CDATA[소견]]></t></si></sst>`),
      '[Content_Types].xml': xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`),
      '_rels/.rels': xml(`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
      'xl/_rels/workbook.xml.rels': xml(`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${R}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`),
      'xl/workbook.xml': xml(`<workbook xmlns="${NS}" xmlns:r="${R}"><sheets><sheet name="소견" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    })
    const buf = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer
    const viaExcelJs = (await parseXlsxWithExcelJs(buf))[0]?.rows ?? []
    expect(viaExcelJs.flat().filter((v) => typeof v === 'string' && v.length > 0)).toHaveLength(0)
    const wb = await parseFileBuffer(buf, 'order.xlsx')
    expect(wb.sheets[0].rows).toEqual([['항목', '값'], ['소견', 5]])
  })

  it('병합 셀은 첫 셀 값으로 채운다 (ExcelJS와 동일)', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('병합')
    ws.addRow(['부서', '이름', '점수'])
    ws.addRow(['기획', '가', 1])
    ws.addRow([null, '나', 2])
    ws.mergeCells('A2:A3')
    const out = await wb.xlsx.writeBuffer()
    const buf = new Uint8Array(out as ArrayBuffer).slice().buffer
    const lite = (await parseXlsxLite(buf, LIMITS))[0].rows
    expect(lite[2][0]).toBe('기획')
    expect(lite).toEqual((await parseXlsxWithExcelJs(buf))[0].rows.map((r) => r.slice(0, 3)))
  })

  it('날짜 서식 판별과 일련번호 변환', () => {
    expect(isDateFormatCode('yyyy-mm-dd')).toBe(true)
    expect(isDateFormatCode('[$-ko-KR]yyyy"년" m"월" d"일"')).toBe(true)
    expect(isDateFormatCode('#,##0"명"')).toBe(false)
    expect(isDateFormatCode('[Red]#,##0.00')).toBe(false)
    expect(isDateFormatCode('General')).toBe(false)
    expect(excelSerialToMs(45292, false)).toBe(Date.UTC(2024, 0, 1))
    expect(excelSerialToMs(61, false)).toBe(Date.UTC(1900, 2, 1))
    expect(excelSerialToMs(0.375, false)).toBe(Date.UTC(1899, 11, 30, 9))
    expect(excelSerialToMs(0, true)).toBe(Date.UTC(1904, 0, 1))
  })

  it('압축 파일이 아니면 사용자용 오류를 낸다', async () => {
    await expect(parseXlsxLite(new TextEncoder().encode('not a zip').buffer as ArrayBuffer, LIMITS)).rejects.toThrow(/압축 구조/)
  })
})

describe('엑셀 임시 잠금 파일', () => {
  it('~$로 시작하는 파일은 안내와 함께 거부한다', () => {
    expect(() => validateFileMeta('~$보고서.xlsx', 165)).toThrow(/임시 잠금 파일/)
    expect(() => validateFileMeta('C:\\temp\\~$a.xlsx', 165)).toThrow(/임시 잠금 파일/)
  })
})
