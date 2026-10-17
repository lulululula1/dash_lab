import type { ChartKind, ColumnRole, ColumnType } from '../types/data'

export const TYPE_LABEL: Record<ColumnType, string> = {
  number: '숫자',
  date: '날짜',
  string: '문자',
  empty: '빈 열',
}

export const ROLE_LABEL: Record<ColumnRole, string> = {
  measure: '수치',
  dimension: '범주',
  time: '시간',
  year: '연도',
  identifier: '식별자',
  text: '텍스트',
  ignored: '제외',
}

export const CHART_LABEL: Record<ChartKind, string> = {
  bar: '막대',
  line: '선',
  pie: '도넛',
  scatter: '산점도',
  histogram: '히스토그램',
  stackedBar: '누적 막대',
}
