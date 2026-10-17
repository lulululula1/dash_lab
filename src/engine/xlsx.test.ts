import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildDataset } from './dataset'
import { normalizeExcelValue, parseFileBuffer } from './parse'

async function makeXlsx(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const a = wb.addWorksheet('실적')
  a.addRow(['2024 교육 실적'])
  a.addRow([])
  a.addRow(['일자', '부서', '인원', '합계식'])
  a.addRow([new Date(Date.UTC(2024, 0, 5)), '기획', 10, { formula: 'C4*2', result: 20 }])
  a.addRow([new Date(Date.UTC(2025, 5, 1)), { richText: [{ text: '인' }, { text: '사' }] }, 0, { formula: 'C5*2+1', result: 1 }])
  a.addRow(['2025-02-30', '기획', null, { error: '#DIV/0!' }])
  const b = wb.addWorksheet('부서')
  b.addRow(['부서', '정원'])
  b.addRow(['기획', 3])
  const out = await wb.xlsx.writeBuffer()
  return new Uint8Array(out as ArrayBuffer).slice().buffer
}

describe('XLSX 읽기', () => {
  it('여러 시트를 읽고 수식 결과·서식 텍스트·오류 셀을 정규화한다', async () => {
    const wb = await parseFileBuffer(await makeXlsx(), 'sample.xlsx')
    expect(wb.format).toBe('xlsx')
    expect(wb.sheets.map((s) => s.name)).toEqual(['실적', '부서'])

    const ds = buildDataset(wb, 0)
    expect(ds.headerRow).toBe(3)
    const [date, dept, people, formula] = ds.columns
    expect(date.type).toBe('date')
    expect(date.values[0]).toBe(Date.UTC(2024, 0, 5))
    expect(date.invalid).toBe(1)
    expect(dept.values[1]).toBe('인사')
    expect(people.values).toEqual([10, 0, null])
    expect(formula.values).toEqual([20, 1, null])
    expect(formula.invalid).toBe(1)
  })

  it('normalizeExcelValue는 하이퍼링크 텍스트를 사용한다', () => {
    expect(normalizeExcelValue({ text: '링크', hyperlink: 'https://example.com' })).toBe('링크')
    expect(normalizeExcelValue({ formula: 'A1' })).toBeNull()
  })
})
