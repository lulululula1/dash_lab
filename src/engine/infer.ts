import type { CellValue, ColumnRole, ColumnType } from '../types/data'

/** 결측으로 간주하는 표기 (대소문자 무시). 숫자 0은 결측이 아니다. */
const MISSING_TOKENS = new Set(['', '-', 'n/a', 'na', 'null', 'nan', 'none'])

export function isMissing(v: CellValue): boolean {
  if (v == null) return true
  if (typeof v === 'string') return MISSING_TOKENS.has(v.trim().toLowerCase())
  if (typeof v === 'number') return Number.isNaN(v)
  return false
}

const NUMBER_RE = /^[+-]?(?:[₩$€¥£]\s?)?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:e[+-]?\d+)?$/i

export interface ParsedNumber {
  value: number
  percent: boolean
}

/** 숫자 해석. 천 단위 쉼표, 통화 기호, 끝의 %를 허용한다. 실패 시 null. */
export function parseNumber(v: CellValue): ParsedNumber | null {
  if (typeof v === 'number') return Number.isFinite(v) ? { value: v, percent: false } : null
  if (typeof v !== 'string') return null
  let s = v.trim()
  if (s === '') return null
  let percent = false
  if (s.endsWith('%')) {
    percent = true
    s = s.slice(0, -1).trim()
  }
  // 회계식 음수 (1,234)
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1).trim()
  }
  if (!NUMBER_RE.test(s) || !/\d/.test(s)) return null
  const n = Number(s.replace(/[₩$€¥£,\s]/g, ''))
  if (!Number.isFinite(n)) return null
  return { value: negative ? -n : n, percent }
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 연·월·일 유효성까지 검증해 UTC ms를 반환한다. */
export function makeUtcDate(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): number | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null
  if (hh > 23 || mm > 59 || ss > 59) return null
  return Date.UTC(y, m - 1, d, hh, mm, ss)
}

const DATE_RE =
  /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2})?)?$/
const YEAR_MONTH_RE = /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*월?$/
const COMPACT_DATE_RE = /^(\d{4})(\d{2})(\d{2})$/

/** 날짜 해석. Date 객체 또는 YYYY-MM-DD / YYYY.MM.DD / YYYY년 M월 D일 / YYYY-MM 형식만 허용한다. */
export function parseDate(v: CellValue): number | null {
  if (v instanceof Date) {
    const t = v.getTime()
    return Number.isNaN(t) ? null : t
  }
  if (typeof v !== 'string') return null
  const s = v.trim()
  let m = DATE_RE.exec(s)
  if (m) {
    return makeUtcDate(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0)
  }
  m = YEAR_MONTH_RE.exec(s)
  if (m) return makeUtcDate(+m[1], +m[2], 1)
  m = COMPACT_DATE_RE.exec(s)
  if (m) return makeUtcDate(+m[1], +m[2], +m[3])
  return null
}

/** 날짜처럼 보이는 문자열인지 (유효성과 무관하게 형식만) */
export function looksLikeDate(v: CellValue): boolean {
  if (v instanceof Date) return true
  if (typeof v !== 'string') return false
  const s = v.trim()
  return DATE_RE.test(s) || YEAR_MONTH_RE.test(s)
}

export function cellToString(v: CellValue): string | null {
  if (isMissing(v)) return null
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  }
  return String(v).trim()
}

const TYPE_THRESHOLD = 0.9
const EXCEL_ERROR_RE = /^#(DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!|SPILL!|CALC!|FIELD!|BLOCKED!|GETTING_DATA)$/i

export function isExcelError(v: CellValue): boolean {
  return typeof v === 'string' && EXCEL_ERROR_RE.test(v.trim())
}

export interface TypeInference {
  type: ColumnType
  nonMissing: number
}

/** 열 유형 추론: 결측을 제외한 값의 90% 이상이 해석되면 해당 유형으로 판정한다. */
export function inferType(values: CellValue[]): TypeInference {
  let nonMissing = 0
  let errors = 0
  let dateLike = 0
  let numeric = 0
  for (const v of values) {
    if (isMissing(v)) continue
    nonMissing++
    if (isExcelError(v)) errors++
    else if (looksLikeDate(v)) dateLike++
    else if (parseNumber(v) !== null) numeric++
  }
  if (nonMissing === 0) return { type: 'empty', nonMissing }
  // 엑셀 오류 셀은 유형 판정에서 빼고, 해석 실패(invalid)로만 집계한다.
  const voters = nonMissing - errors
  if (voters === 0) return { type: 'string', nonMissing }
  // 작은 표에서는 오타 1건만으로 90%를 밑돌 수 있어, 예외 값이 1건뿐이면 해당 유형으로 본다.
  const accepts = (ok: number) => ok / voters >= TYPE_THRESHOLD || (ok >= 3 && voters - ok <= 1)
  if (accepts(dateLike)) return { type: 'date', nonMissing }
  if (accepts(numeric)) return { type: 'number', nonMissing }
  return { type: 'string', nonMissing }
}

const YEAR_NAME_RE = /(연도|년도|^년$|year|yyyy|회계\s*연도)/i
const NOTE_NAME_RE = /(비고|메모|설명|내용|의견|주소|note|memo|comment|remark|description)/i
const ID_NAME_RE = /(^id$|[_\s-]id$|아이디|번호|코드|code$|^no\.?$|순번|연번|일련)/i

export interface RoleInput {
  name: string
  type: ColumnType
  numbers?: number[]
  distinct: number
  nonMissing: number
}

/** 열 역할 추론 (규칙 기반) */
export function inferRole({ name, type, numbers, distinct, nonMissing }: RoleInput): ColumnRole {
  if (type === 'empty') return 'ignored'
  if (type === 'date') return 'time'
  if (type === 'number') {
    const nums = numbers ?? []
    const allYearLike = nums.length > 0 && nums.every((n) => Number.isInteger(n) && n >= 1900 && n <= 2100)
    if (allYearLike && YEAR_NAME_RE.test(name)) return 'year'
    if (ID_NAME_RE.test(name)) return 'identifier'
    return 'measure'
  }
  if (ID_NAME_RE.test(name) && distinct > 50) return 'identifier'
  if (NOTE_NAME_RE.test(name)) return 'text'
  if (distinct <= 50 && (distinct <= 12 || distinct <= nonMissing * 0.6)) return 'dimension'
  return 'text'
}
