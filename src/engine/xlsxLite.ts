import { unzipSync } from 'fflate'
import type { CellValue, RawSheet } from '../types/data'
import { DataError } from './errors'

/**
 * 값만 읽는 경량 XLSX 판독기 (ExcelJS가 열지 못하는 파일의 대체 경로).
 * - 네임스페이스 접두사(<x:workbook> 등)를 쓰는 파일도 요소의 localName으로 읽는다.
 * - 차트·그림·피벗·서식은 무시하고 셀 값만 추출한다.
 */

export interface LiteLimits {
  maxRows: number
  maxColumns: number
}

/** 압축 해제 후 전체 크기 상한 (압축 폭탄 방지) */
const MAX_UNZIPPED_BYTES = 300 * 1024 * 1024

type XmlElement = Element

async function getParser(): Promise<{ parseFromString(s: string, type: string): Document }> {
  if (typeof globalThis.DOMParser === 'function') return new globalThis.DOMParser()
  // 브라우저에는 DOMParser가 있으므로 이 경로는 Node(테스트)에서만 쓰인다.
  const mod = await import('@xmldom/xmldom')
  return new mod.DOMParser() as unknown as { parseFromString(s: string, type: string): Document }
}

function children(el: XmlElement | Document | null | undefined, name: string): XmlElement[] {
  const out: XmlElement[] = []
  if (!el) return out
  const nodes = el.childNodes
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i] as XmlElement
    if (n.nodeType === 1 && n.localName === name) out.push(n)
  }
  return out
}

function child(el: XmlElement | Document | null | undefined, name: string): XmlElement | undefined {
  return children(el, name)[0]
}

/** 접두사와 무관하게 localName으로 속성을 찾는다 (예: r:id). */
function attr(el: XmlElement, localName: string): string | null {
  const direct = el.getAttribute(localName)
  if (direct !== null && direct !== '') return direct
  const attrs = el.attributes
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i]
    if (a.localName === localName) return a.value
  }
  return null
}

/** 하위의 모든 <t> 텍스트를 이어 붙인다. 윗주(<rPh>)는 제외. */
function textOf(el: XmlElement | undefined): string {
  if (!el) return ''
  let s = ''
  const walk = (node: XmlElement) => {
    const nodes = node.childNodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i] as XmlElement
      if (n.nodeType !== 1) continue
      if (n.localName === 'rPh' || n.localName === 'phoneticPr') continue
      if (n.localName === 't') s += n.textContent ?? ''
      else walk(n)
    }
  }
  walk(el)
  return s
}

function normPath(p: string): string {
  const parts: string[] = []
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

function resolveTarget(baseDir: string, target: string): string {
  return target.startsWith('/') ? normPath(target) : normPath(`${baseDir}/${target}`)
}

/** Excel 기본 날짜 서식 번호 (한국어 로캘 27~36, 50~58 포함) */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])

export function isDateFormatCode(code: string): boolean {
  const cleaned = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[(?:h+|m+|s+)\]/gi, 'h') // 경과 시간 [h]
    .replace(/\[[^\]]*\]/g, '') // [Red], [$-ko-KR] 등
    .replace(/_.|\*./g, '')
  if (/general/i.test(cleaned)) return false
  return /[ymdhs]|오전|오후|AM\/PM|A\/P/i.test(cleaned) && !/^[#0.,%\s?/E+-]+$/.test(cleaned)
}

const DAY_MS = 86400000
/**
 * 엑셀 날짜 일련번호 → UTC ms. ExcelJS와 같은 기준(1899-12-30)을 써서 두 판독기 결과를 일치시킨다.
 * (1900-03-01 이후 날짜는 엑셀 표시와 같고, 시각만 있는 값은 1899-12-30의 시각이 된다.)
 */
export function excelSerialToMs(serial: number, date1904: boolean): number {
  const base = date1904 ? 24107 : 25569
  return Math.round((serial - base) * DAY_MS)
}

function colIndexFromRef(ref: string): number {
  let n = 0
  for (const ch of ref) {
    const code = ch.charCodeAt(0)
    if (code >= 65 && code <= 90) n = n * 26 + (code - 64)
    else if (code >= 97 && code <= 122) n = n * 26 + (code - 96)
    else break
  }
  return n - 1
}

function parseRef(ref: string): { r: number; c: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref.trim())
  return m ? { r: Number(m[2]) - 1, c: colIndexFromRef(m[1]) } : null
}

/** 병합 영역의 나머지 셀을 첫 셀 값으로 채운다 (ExcelJS와 같은 동작 — 병합된 부서명 등이 행마다 유지됨). */
function fillMerged(rows: CellValue[][], refs: string[], limits: LiteLimits) {
  for (const ref of refs) {
    const [a, b] = ref.split(':')
    const s = parseRef(a ?? '')
    const e = parseRef(b ?? a ?? '')
    if (!s || !e) continue
    const value = rows[s.r]?.[s.c] ?? null
    if (value === null) continue
    for (let r = s.r; r <= Math.min(e.r, limits.maxRows); r++) {
      if (!rows[r]) rows[r] = []
      for (let c = s.c; c <= Math.min(e.c, limits.maxColumns - 1); c++) {
        if (r === s.r && c === s.c) continue
        for (let k = rows[r].length; k < c; k++) rows[r][k] = null
        rows[r][c] = value
      }
    }
  }
}

export async function parseXlsxLite(buf: ArrayBuffer, limits: LiteLimits): Promise<RawSheet[]> {
  let total = 0
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(buf), {
      filter: (f) => {
        total += f.originalSize
        if (total > MAX_UNZIPPED_BYTES) throw new DataError('file-too-large', '압축을 푼 파일 크기가 너무 큽니다.', '불필요한 시트·이미지를 지운 뒤 다시 저장해 주세요.')
        const name = f.name.toLowerCase()
        return name.endsWith('.xml') || name.endsWith('.rels')
      },
    })
  } catch (e) {
    if (e instanceof DataError) throw e
    throw new DataError('corrupted', 'XLSX 압축 구조를 읽을 수 없습니다.', '파일이 손상되었거나 암호로 보호되어 있을 수 있습니다.')
  }
  // 경로 대소문자·선행 슬래시 차이를 흡수
  const byPath = new Map<string, Uint8Array>()
  for (const [k, v] of Object.entries(files)) byPath.set(normPath(k).toLowerCase(), v)
  const decoder = new TextDecoder('utf-8')
  const parser = await getParser()
  const readXml = (path: string): Document | null => {
    const data = byPath.get(normPath(path).toLowerCase())
    if (!data) return null
    return parser.parseFromString(decoder.decode(data), 'application/xml')
  }

  // 1) 통합 문서 위치
  let workbookPath = 'xl/workbook.xml'
  const rootRels = readXml('_rels/.rels')
  for (const rel of children(rootRels?.documentElement, 'Relationship')) {
    if ((attr(rel, 'Type') ?? '').endsWith('/officeDocument')) workbookPath = resolveTarget('', attr(rel, 'Target') ?? workbookPath)
  }
  const wbDoc = readXml(workbookPath)
  if (!wbDoc?.documentElement) throw new DataError('corrupted', '통합 문서 정보를 찾을 수 없습니다.', '엑셀에서 열어 다시 저장한 뒤 업로드해 주세요.')
  const wbDir = workbookPath.includes('/') ? workbookPath.slice(0, workbookPath.lastIndexOf('/')) : ''
  const wbName = workbookPath.slice(workbookPath.lastIndexOf('/') + 1)

  // 2) 시트 id → 경로
  const relTargets = new Map<string, string>()
  let sharedStringsPath = `${wbDir}/sharedStrings.xml`
  let stylesPath = `${wbDir}/styles.xml`
  const wbRels = readXml(`${wbDir}/_rels/${wbName}.rels`)
  for (const rel of children(wbRels?.documentElement, 'Relationship')) {
    const id = attr(rel, 'Id')
    const type = attr(rel, 'Type') ?? ''
    const target = resolveTarget(wbDir, attr(rel, 'Target') ?? '')
    if (id) relTargets.set(id, target)
    if (type.endsWith('/sharedStrings')) sharedStringsPath = target
    if (type.endsWith('/styles')) stylesPath = target
  }

  const wbRoot = wbDoc.documentElement
  const wbPr = child(wbRoot, 'workbookPr')
  const date1904 = wbPr ? ['1', 'true'].includes((attr(wbPr, 'date1904') ?? '').toLowerCase()) : false

  // 3) 공유 문자열
  const shared: string[] = []
  const sst = readXml(sharedStringsPath)
  for (const si of children(sst?.documentElement, 'si')) shared.push(textOf(si))

  // 4) 날짜 서식 스타일
  const dateStyles = new Set<number>()
  const styles = readXml(stylesPath)
  if (styles?.documentElement) {
    const custom = new Map<number, string>()
    for (const nf of children(child(styles.documentElement, 'numFmts'), 'numFmt')) {
      custom.set(Number(attr(nf, 'numFmtId')), attr(nf, 'formatCode') ?? '')
    }
    children(child(styles.documentElement, 'cellXfs'), 'xf').forEach((xf, i) => {
      const id = Number(attr(xf, 'numFmtId') ?? 0)
      const code = custom.get(id)
      if (code !== undefined ? isDateFormatCode(code) : BUILTIN_DATE_FORMATS.has(id)) dateStyles.add(i)
    })
  }

  // 5) 시트별 셀 값
  const sheets: RawSheet[] = []
  for (const s of children(child(wbRoot, 'sheets'), 'sheet')) {
    const name = attr(s, 'name') ?? `Sheet${sheets.length + 1}`
    const state = attr(s, 'state')
    const target = relTargets.get(attr(s, 'id') ?? '')
    const doc = target ? readXml(target) : null
    if (!doc?.documentElement || doc.documentElement.localName !== 'worksheet') continue // 차트 시트 등
    const rows: CellValue[][] = []
    let truncated = false
    let nextRow = 0
    for (const rowEl of children(child(doc.documentElement, 'sheetData'), 'row')) {
      const rAttr = attr(rowEl, 'r')
      const r = rAttr ? Number(rAttr) - 1 : nextRow
      nextRow = r + 1
      if (r >= limits.maxRows + 1) {
        truncated = true
        break
      }
      const cells: CellValue[] = []
      let nextCol = 0
      for (const c of children(rowEl, 'c')) {
        const ref = attr(c, 'r')
        const col = ref ? colIndexFromRef(ref) : nextCol
        nextCol = col + 1
        if (col < 0 || col >= limits.maxColumns) continue
        const t = attr(c, 't') ?? 'n'
        const v = child(c, 'v')?.textContent ?? null
        let value: CellValue = null
        switch (t) {
          case 's':
            value = v === null ? null : (shared[Number(v)] ?? null)
            break
          case 'inlineStr':
            value = textOf(child(c, 'is'))
            break
          case 'str':
            value = v
            break
          case 'b':
            value = v === null ? null : v === '1' || v.toLowerCase() === 'true'
            break
          case 'e':
            value = v
            break
          case 'd': {
            const d = v ? new Date(v) : null
            value = d && !Number.isNaN(d.getTime()) ? d : v
            break
          }
          default: {
            if (v === null || v === '') break
            const n = Number(v)
            if (!Number.isFinite(n)) value = v
            else if (dateStyles.has(Number(attr(c, 's') ?? 0))) value = new Date(excelSerialToMs(n, date1904))
            else value = n
          }
        }
        cells[col] = value
      }
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null
      rows[r] = cells
    }
    for (let i = 0; i < rows.length; i++) if (rows[i] === undefined) rows[i] = []
    fillMerged(rows, children(child(doc.documentElement, 'mergeCells'), 'mergeCell').map((m) => attr(m, 'ref') ?? ''), limits)
    while (rows.length > 0 && rows[rows.length - 1].every((c) => c == null || c === '')) rows.pop()
    sheets.push({ name, rows, truncated, hidden: !!state && state !== 'visible' })
  }
  if (sheets.length === 0) throw new DataError('no-sheets', '통합 문서에서 데이터 시트를 찾지 못했습니다.', '차트 전용 시트만 있는 파일은 분석할 수 없습니다.')
  return sheets
}
