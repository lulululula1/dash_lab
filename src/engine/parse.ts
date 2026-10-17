import Papa from 'papaparse'
import type { CellValue, RawSheet, RawWorkbook } from '../types/data'
import { DataError } from './errors'
import { parseXlsxLite } from './xlsxLite'

export const MAX_FILE_BYTES = 20 * 1024 * 1024
export const MAX_ROWS = 200_000
export const MAX_COLUMNS = 300
export const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx'] as const

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

/** 업로드 전에 이름과 크기만으로 확인할 수 있는 제한을 검사한다. */
export function validateFileMeta(name: string, size: number): void {
  const ext = extensionOf(name)
  const base = name.replace(/^.*[\\/]/, '')
  if (base.startsWith('~$')) {
    throw new DataError(
      'lock-file',
      '엑셀 임시 잠금 파일(~$로 시작)입니다.',
      '엑셀이 파일을 여는 동안 만드는 임시 파일이라 데이터가 없습니다. ~$ 없이 같은 이름의 원본 파일을 선택해 주세요.',
    )
  }
  if (ext === '.xls') {
    throw new DataError(
      'legacy-xls',
      '구형 엑셀(.xls) 형식은 지원하지 않습니다.',
      '엑셀에서 "다른 이름으로 저장 → Excel 통합 문서(.xlsx)"로 변환한 뒤 다시 올려 주세요.',
    )
  }
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new DataError('unsupported-format', '지원하지 않는 파일 형식입니다.', 'CSV 또는 XLSX 파일만 업로드할 수 있습니다.')
  }
  if (size === 0) {
    throw new DataError('empty-file', '빈 파일입니다.', '데이터가 들어 있는 파일을 선택해 주세요.')
  }
  if (size > MAX_FILE_BYTES) {
    throw new DataError(
      'file-too-large',
      `파일 크기가 제한(${MAX_FILE_BYTES / 1024 / 1024}MB)을 초과했습니다.`,
      '필요한 시트나 열만 남겨 파일 크기를 줄여 주세요.',
    )
  }
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((b, i) => bytes[i] === b)
}

/** UTF-8로 먼저 해석하고, 실패하면 국내 엑셀 CSV에서 흔한 EUC-KR(CP949)로 해석한다. */
export function decodeText(buf: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buf)
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text: text.replace(/^﻿/, ''), encoding: 'utf-8' }
  } catch {
    try {
      const text = new TextDecoder('euc-kr', { fatal: false }).decode(bytes)
      return { text, encoding: 'euc-kr' }
    } catch {
      throw new DataError('encoding', '파일의 문자 인코딩을 해석할 수 없습니다.', 'UTF-8 형식의 CSV로 다시 저장해 주세요.')
    }
  }
}

export function parseCsvText(text: string, name = 'CSV'): RawSheet {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false })
  const fatal = result.errors.find((e) => e.type === 'Quotes')
  if (fatal && result.data.length === 0) {
    throw new DataError('corrupted', 'CSV 구조를 해석할 수 없습니다.', '따옴표(")가 올바르게 닫혀 있는지 확인해 주세요.')
  }
  let rows: CellValue[][] = result.data
  // 파일 끝 빈 줄 제거
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === '' || c == null)) rows.pop()
  const truncated = rows.length > MAX_ROWS + 1
  if (truncated) rows = rows.slice(0, MAX_ROWS + 1)
  rows = rows.map((r) => (r.length > MAX_COLUMNS ? r.slice(0, MAX_COLUMNS) : r))
  return { name, rows, truncated }
}

interface ExcelLikeValue {
  result?: unknown
  richText?: { text: string }[]
  text?: unknown
  error?: string
  formula?: string
  sharedFormula?: string
}

/** exceljs 셀 값을 원시 셀 값으로 정규화한다. */
export function normalizeExcelValue(v: unknown): CellValue {
  if (v == null) return null
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    const o = v as ExcelLikeValue
    if (o.error) return o.error
    if ('formula' in o || 'sharedFormula' in o || 'result' in o) return normalizeExcelValue(o.result)
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join('')
    if ('text' in o) return normalizeExcelValue(o.text)
  }
  return null
}

async function loadExcelJs() {
  const mod = await import('exceljs')
  const withDefault = mod as unknown as { default?: typeof mod }
  return withDefault.default ?? mod
}

/**
 * XLSX 읽기: 값만 읽는 경량 판독기(xlsxLite)를 먼저 쓰고, 실패하면 ExcelJS로 다시 시도한다.
 * 실제 파일 50개 비교에서 ExcelJS는 네임스페이스 접두사 XML·일부 차트 파일을 열지 못하고(12개),
 * 시트 파일명 대소문자·내부 파일 순서에 따라 시트나 문자열 값을 조용히 빠뜨리는 경우(4개)가 있었다.
 */
export async function parseXlsxBuffer(buf: ArrayBuffer): Promise<RawSheet[]> {
  try {
    return await parseXlsxLite(buf, { maxRows: MAX_ROWS, maxColumns: MAX_COLUMNS })
  } catch (primary) {
    if (primary instanceof DataError && primary.code === 'file-too-large') throw primary
    try {
      return await parseXlsxWithExcelJs(buf)
    } catch (fallback) {
      if (primary instanceof DataError && primary.code !== 'corrupted') throw primary
      if (fallback instanceof DataError && fallback.code !== 'corrupted') throw fallback
      throw new DataError('corrupted', 'XLSX 파일을 열 수 없습니다.', '파일이 손상되었거나 암호로 보호되어 있을 수 있습니다. 엑셀에서 열어 "다른 이름으로 저장"한 뒤 다시 올려 주세요.')
    }
  }
}

/** ExcelJS 판독 경로 (대체용, 테스트에서 결과 비교에도 사용) */
export async function parseXlsxWithExcelJs(buf: ArrayBuffer): Promise<RawSheet[]> {
  const ExcelJS = await loadExcelJs()
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buf)
  } catch {
    throw new DataError('corrupted', 'XLSX 파일을 열 수 없습니다.')
  }
  const sheets: RawSheet[] = []
  for (const ws of wb.worksheets) {
    const rowLimit = Math.min(ws.rowCount, MAX_ROWS + 1)
    const colLimit = Math.min(ws.columnCount, MAX_COLUMNS)
    const rows: CellValue[][] = []
    for (let r = 1; r <= rowLimit; r++) {
      const row = ws.getRow(r)
      const cells: CellValue[] = []
      for (let c = 1; c <= colLimit; c++) cells.push(normalizeExcelValue(row.getCell(c).value))
      rows.push(cells)
    }
    while (rows.length > 0 && rows[rows.length - 1].every((c) => c == null || c === '')) rows.pop()
    sheets.push({ name: ws.name, rows, truncated: ws.rowCount > MAX_ROWS + 1, hidden: ws.state !== 'visible' })
  }
  if (sheets.length === 0) throw new DataError('no-sheets', '통합 문서에 시트가 없습니다.')
  return sheets
}

/** 파일 내용을 읽어 원시 통합 문서로 변환한다. 모든 처리는 브라우저 안에서 이루어진다. */
export async function parseFileBuffer(buf: ArrayBuffer, fileName: string): Promise<RawWorkbook> {
  validateFileMeta(fileName, buf.byteLength)
  const bytes = new Uint8Array(buf.slice(0, 8))
  const ext = extensionOf(fileName)
  const isZip = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
  const isOle = startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])

  if (ext === '.xlsx') {
    if (isOle) {
      throw new DataError(
        'legacy-xls',
        '확장자는 .xlsx이지만 실제로는 구형 엑셀 또는 암호화된 파일입니다.',
        '엑셀에서 암호를 해제하고 .xlsx 형식으로 다시 저장해 주세요.',
      )
    }
    if (!isZip) throw new DataError('corrupted', '올바른 XLSX 파일이 아닙니다.', '파일 확장자와 실제 형식이 일치하는지 확인해 주세요.')
    const sheets = await parseXlsxBuffer(buf)
    return { fileName, fileSize: buf.byteLength, format: 'xlsx', sheets, isDemo: false }
  }

  if (isZip || isOle) {
    throw new DataError('unsupported-format', 'CSV 확장자이지만 실제로는 엑셀 파일입니다.', '확장자를 .xlsx로 바꾸거나 CSV로 다시 저장해 주세요.')
  }
  const { text, encoding } = decodeText(buf)
  if (text.includes('\u0000')) {
    throw new DataError('corrupted', '텍스트 파일이 아닌 것으로 보입니다.', 'CSV 파일인지 확인해 주세요.')
  }
  const sheet = parseCsvText(text, fileName.replace(/\.[^.]+$/, ''))
  return { fileName, fileSize: buf.byteLength, format: 'csv', sheets: [sheet], encoding, isDemo: false }
}

export async function readFile(file: File): Promise<RawWorkbook> {
  validateFileMeta(file.name, file.size)
  const buf = await file.arrayBuffer()
  return parseFileBuffer(buf, file.name)
}
