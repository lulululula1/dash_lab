import type { CellValue, Column, Dataset, DatasetQuality, NumericStats, QualityWarning, RawSheet, RawWorkbook, ValueCount } from '../types/data'
import { DataError } from './errors'
import { cellToString, inferRole, inferType, isMissing, parseDate, parseNumber } from './infer'

const HEADER_SCAN_ROWS = 20

function nonEmptyCount(row: CellValue[]): number {
  let n = 0
  for (const c of row) if (!isMissing(c)) n++
  return n
}

/**
 * 헤더 행 탐지: 상단 20행 중 가장 많이 채워진 행의 절반 이상(최소 2칸)이 채워진 첫 행.
 * 보고서 제목 행처럼 한두 칸만 있는 행을 건너뛴다.
 */
export function detectHeaderRow(rows: CellValue[][]): number {
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS)
  let maxFilled = 0
  for (let i = 0; i < limit; i++) maxFilled = Math.max(maxFilled, nonEmptyCount(rows[i]))
  if (maxFilled === 0) return -1
  const need = maxFilled === 1 ? 1 : Math.max(2, Math.ceil(maxFilled / 2))
  for (let i = 0; i < limit; i++) if (nonEmptyCount(rows[i]) >= need) return i
  return -1
}

function columnLetter(i: number): string {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function makeHeaderNames(header: CellValue[], width: number): string[] {
  const used = new Map<string, number>()
  const names: string[] = []
  for (let i = 0; i < width; i++) {
    const raw = cellToString(header[i] ?? null)
    let name = raw && raw.length > 0 ? raw.replace(/\s+/g, ' ') : `열 ${columnLetter(i)}`
    const seen = used.get(name) ?? 0
    used.set(name, seen + 1)
    if (seen > 0) name = `${name} (${seen + 1})`
    names.push(name)
  }
  return names
}

export function computeStats(nums: number[]): NumericStats | undefined {
  if (nums.length === 0) return undefined
  let sum = 0
  let min = Infinity
  let max = -Infinity
  let zeroCount = 0
  for (const n of nums) {
    sum += n
    if (n < min) min = n
    if (n > max) max = n
    if (n === 0) zeroCount++
  }
  const mean = sum / nums.length
  let sq = 0
  for (const n of nums) sq += (n - mean) ** 2
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return { count: nums.length, sum, mean, min, max, median, std: Math.sqrt(sq / nums.length), zeroCount }
}

interface Extracted {
  header: CellValue[]
  headerRow: number
  body: CellValue[][]
  bodyRowNumbers: number[]
  width: number
  emptyRowsSkipped: number
}

/** 1단계: 헤더와 데이터 영역 추출 */
export function extractTable(sheet: RawSheet): Extracted {
  const headerIdx = detectHeaderRow(sheet.rows)
  if (headerIdx < 0) {
    throw new DataError('no-header', `'${sheet.name}' 시트에서 데이터를 찾지 못했습니다.`, '시트에 머리글(열 이름)과 데이터가 있는지 확인해 주세요.')
  }
  const header = sheet.rows[headerIdx]
  const body: CellValue[][] = []
  const bodyRowNumbers: number[] = []
  let emptyRowsSkipped = 0
  let width = header.length
  for (let i = headerIdx + 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i]
    if (nonEmptyCount(row) === 0) {
      emptyRowsSkipped++
      continue
    }
    body.push(row)
    bodyRowNumbers.push(i + 1)
    if (row.length > width) width = row.length
  }
  // 오른쪽 끝의 완전히 빈 열 제거
  while (width > 0) {
    const c = width - 1
    const headerEmpty = isMissing(header[c] ?? null)
    const bodyEmpty = body.every((r) => isMissing(r[c] ?? null))
    if (headerEmpty && bodyEmpty) width--
    else break
  }
  if (body.length === 0) {
    throw new DataError('no-data-rows', `'${sheet.name}' 시트에 머리글 아래 데이터 행이 없습니다.`, '첫 행은 열 이름, 그 아래에 데이터가 오도록 구성해 주세요.')
  }
  return { header, headerRow: headerIdx + 1, body, bodyRowNumbers, width, emptyRowsSkipped }
}

/** 2단계: 열 단위 유형 검사와 값 변환 */
export function buildColumns(t: Extracted): Column[] {
  const names = makeHeaderNames(t.header, t.width)
  const columns: Column[] = []
  for (let c = 0; c < t.width; c++) {
    const raw = t.body.map((r) => r[c] ?? null)
    const { type, nonMissing } = inferType(raw)
    const values: (number | string | null)[] = new Array(raw.length)
    let missing = 0
    let invalid = 0
    const invalidRows: number[] = []
    let hasPercent = false
    const nums: number[] = []
    const counts = new Map<string, number>()
    let dMin = Infinity
    let dMax = -Infinity

    for (let i = 0; i < raw.length; i++) {
      const v = raw[i]
      if (isMissing(v)) {
        values[i] = null
        missing++
        continue
      }
      if (type === 'number') {
        const p = parseNumber(v)
        if (p) {
          values[i] = p.value
          nums.push(p.value)
          if (p.percent) hasPercent = true
          counts.set(String(p.value), 1)
        } else {
          values[i] = null
          invalid++
          if (invalidRows.length < 5) invalidRows.push(t.bodyRowNumbers[i])
        }
      } else if (type === 'date') {
        const d = parseDate(v)
        if (d !== null) {
          values[i] = d
          if (d < dMin) dMin = d
          if (d > dMax) dMax = d
          counts.set(String(d), 1)
        } else {
          values[i] = null
          invalid++
          if (invalidRows.length < 5) invalidRows.push(t.bodyRowNumbers[i])
        }
      } else {
        const s = cellToString(v)
        values[i] = s
        if (s !== null) counts.set(s, (counts.get(s) ?? 0) + 1)
      }
    }

    const distinct = counts.size
    const role = inferRole({ name: names[c], type, numbers: nums, distinct, nonMissing })
    let topValues: ValueCount[] | undefined
    if (type === 'string') {
      topValues = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    }
    columns.push({
      key: `c${c}`,
      name: names[c],
      index: c,
      type,
      role,
      values,
      missing,
      invalid,
      invalidRows,
      distinct,
      stats: type === 'number' ? computeStats(nums) : undefined,
      dateRange: type === 'date' && dMin <= dMax ? { min: dMin, max: dMax } : undefined,
      topValues,
      hasPercent: hasPercent || undefined,
    })
  }
  return columns
}

/** 3단계: 품질 검사 (결측·오류·중복) */
export function assessQuality(t: Extracted, columns: Column[]): DatasetQuality {
  const seen = new Set<string>()
  let duplicateRows = 0
  const duplicateRowNumbers: number[] = []
  for (let i = 0; i < t.body.length; i++) {
    const key = JSON.stringify(columns.map((col) => (col.values[i] === null ? cellToString(t.body[i][col.index] ?? null) : col.values[i])))
    if (seen.has(key)) {
      duplicateRows++
      if (duplicateRowNumbers.length < 10) duplicateRowNumbers.push(t.bodyRowNumbers[i])
    } else seen.add(key)
  }

  const rowCount = t.body.length
  let totalMissing = 0
  let totalInvalid = 0
  const warnings: QualityWarning[] = []
  for (const col of columns) {
    totalMissing += col.missing
    totalInvalid += col.invalid
    if (col.role === 'ignored') {
      warnings.push({ level: 'info', message: `'${col.name}' 열은 값이 모두 비어 있어 분석에서 제외했습니다.`, columnKey: col.key })
      continue
    }
    if (col.invalid > 0) {
      const kind = col.type === 'number' ? '숫자' : '날짜'
      warnings.push({
        level: 'warn',
        message: `'${col.name}' 열에서 ${kind}로 해석할 수 없는 값 ${col.invalid.toLocaleString('ko-KR')}건을 집계에서 제외했습니다 (예: ${col.invalidRows.join(', ')}행).`,
        columnKey: col.key,
      })
    }
    const missRate = col.missing / rowCount
    if (missRate >= 0.3) {
      warnings.push({ level: 'warn', message: `'${col.name}' 열의 결측률이 ${(missRate * 100).toFixed(1)}%로 높습니다.`, columnKey: col.key })
    }
    if (col.hasPercent) {
      warnings.push({ level: 'info', message: `'${col.name}' 열의 % 값은 기호를 제외한 숫자(예: 12.5% → 12.5)로 계산합니다.`, columnKey: col.key })
    }
  }
  if (duplicateRows > 0) {
    warnings.push({
      level: 'warn',
      message: `모든 열 값이 같은 중복 행 ${duplicateRows.toLocaleString('ko-KR')}건이 있습니다. 집계에는 그대로 포함됩니다.`,
    })
  }
  if (!columns.some((c) => c.role === 'measure')) {
    warnings.push({ level: 'info', message: '합계·평균을 낼 수 있는 숫자 열이 없어 행 수(건수) 기준으로만 집계합니다.' })
  }
  return {
    totalCells: rowCount * columns.length,
    totalMissing,
    totalInvalid,
    duplicateRows,
    duplicateRowNumbers,
    emptyRowsSkipped: t.emptyRowsSkipped,
    warnings,
  }
}

let datasetSeq = 0

export function buildDataset(workbook: RawWorkbook, sheetIndex: number): Dataset {
  const sheet = workbook.sheets[sheetIndex]
  if (!sheet) throw new DataError('no-sheets', '선택한 시트를 찾을 수 없습니다.')
  const t = extractTable(sheet)
  const columns = buildColumns(t)
  const quality = assessQuality(t, columns)
  return assemble(workbook, sheet, t, columns, quality)
}

export function assemble(workbook: RawWorkbook, sheet: RawSheet, t: Extracted, columns: Column[], quality: DatasetQuality): Dataset {
  if (sheet.truncated) {
    quality.warnings.unshift({ level: 'warn', message: '행 수가 제한(200,000행)을 넘어 앞부분만 분석했습니다.' })
  }
  return {
    id: `ds-${++datasetSeq}`,
    sourceName: workbook.fileName,
    sheetName: sheet.name,
    format: workbook.format,
    isDemo: workbook.isDemo,
    rowCount: t.body.length,
    columns,
    rowNumbers: t.bodyRowNumbers,
    headerRow: t.headerRow,
    truncated: sheet.truncated,
    quality,
  }
}

export type { Extracted }
