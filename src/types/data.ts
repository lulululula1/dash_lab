/**
 * NEXUS DATA COMMAND — 데이터 모델 정의
 * 모든 값은 브라우저 메모리에서만 다루며 외부로 전송하지 않는다.
 */

/** 파일에서 읽은 원시 셀 값 (형 변환 전) */
export type CellValue = string | number | boolean | Date | null

export type SourceFormat = 'csv' | 'xlsx' | 'demo'

export interface RawSheet {
  name: string
  rows: CellValue[][]
  /** 행 수 제한으로 잘린 경우 true */
  truncated: boolean
  hidden?: boolean
}

export interface RawWorkbook {
  fileName: string
  fileSize: number
  format: SourceFormat
  sheets: RawSheet[]
  /** CSV 인코딩 (utf-8 / euc-kr) */
  encoding?: string
  isDemo: boolean
}

/** 열의 저장 형식 */
export type ColumnType = 'number' | 'date' | 'string' | 'empty'

/**
 * 열의 분석 역할
 * - measure: 합계·평균을 낼 수 있는 수치
 * - dimension: 범주 집계 기준
 * - time: 날짜 열
 * - year: 연도 열 (정수)
 * - identifier: 번호·코드 등 계산 대상이 아닌 열
 * - text: 고유값이 너무 많은 문자열
 * - ignored: 값이 없는 열
 */
export type ColumnRole = 'measure' | 'dimension' | 'time' | 'year' | 'identifier' | 'text' | 'ignored'

export interface NumericStats {
  /** 유효 값 개수 (결측·오류 제외) */
  count: number
  sum: number
  mean: number
  min: number
  max: number
  median: number
  std: number
  zeroCount: number
}

export interface ValueCount {
  value: string
  count: number
}

export interface Column {
  key: string
  name: string
  /** 원본 시트의 열 번호 (0부터) */
  index: number
  type: ColumnType
  role: ColumnRole
  /** number/date 열은 숫자(날짜는 UTC ms), string 열은 문자열, 결측·오류는 null */
  values: (number | string | null)[]
  missing: number
  /** 값은 있으나 열 유형으로 해석하지 못한 셀 수 */
  invalid: number
  /** 해석 실패 셀의 원본 행 번호 (최대 5개) */
  invalidRows: number[]
  distinct: number
  stats?: NumericStats
  dateRange?: { min: number; max: number }
  topValues?: ValueCount[]
  /** 퍼센트 기호가 붙은 값이 있었는지 */
  hasPercent?: boolean
}

export type WarningLevel = 'info' | 'warn' | 'error'

export interface QualityWarning {
  level: WarningLevel
  message: string
  columnKey?: string
}

export interface DatasetQuality {
  totalCells: number
  totalMissing: number
  totalInvalid: number
  duplicateRows: number
  /** 중복으로 판정된 행의 원본 행 번호 (최대 10개) */
  duplicateRowNumbers: number[]
  emptyRowsSkipped: number
  warnings: QualityWarning[]
}

export interface Dataset {
  id: string
  sourceName: string
  sheetName: string
  format: SourceFormat
  isDemo: boolean
  rowCount: number
  columns: Column[]
  /** 각 데이터 행의 원본 시트 행 번호 (1부터) */
  rowNumbers: number[]
  /** 헤더로 사용한 원본 행 번호 (1부터) */
  headerRow: number
  truncated: boolean
  quality: DatasetQuality
}

export type AggFn = 'sum' | 'mean' | 'count' | 'min' | 'max'
export type TimeGrain = 'year' | 'month'
export type ChartKind = 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'stackedBar'

export interface ChartSpec {
  id: string
  kind: ChartKind
  title: string
  /** 범주·시간 축 열 */
  dimensionKey?: string
  /** 값 열 (count 집계 시 생략 가능) */
  measureKey?: string
  /** 산점도의 X축 수치 열 */
  xMeasureKey?: string
  /** 누적 막대의 계열 열 */
  seriesKey?: string
  agg: AggFn
  timeGrain?: TimeGrain
  /** 규칙 기반 추천 사유 */
  reason: string
}

/** 열 key → 허용할 그룹 key 목록 */
export type FilterState = Record<string, string[]>

export interface AggRow {
  key: string
  label: string
  sortKey: number | string
  /** 유효 값이 없으면 null (0과 구분) */
  value: number | null
  /** 집계에 사용된 유효 값 개수 */
  validCount: number
  /** 그룹에 속한 행 수 */
  rowCount: number
}

export interface GroupResult {
  rows: AggRow[]
  /** 차원 값이 비어 제외된 행 수 */
  excludedMissingDimension: number
  /** 수치 값이 비어 집계에서 빠진 행 수 */
  excludedMissingMeasure: number
  totalRows: number
}

export type GrowthStatus = 'ok' | 'zero-base' | 'no-prev' | 'no-data'

export interface GrowthRow {
  key: string
  value: number | null
  prevValue: number | null
  /** 비율 (0.12 = 12%) — 산출 불가 시 null */
  growth: number | null
  status: GrowthStatus
}

export type InsightSource = 'rule' | 'ai'

export interface Insight {
  id: string
  source: InsightSource
  level: 'positive' | 'negative' | 'neutral' | 'warning'
  title: string
  detail: string
}
