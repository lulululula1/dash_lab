import type { AggFn, AggRow, Column, Dataset, FilterState, GroupResult, GrowthRow, NumericStats, TimeGrain } from '../types/data'
import { computeStats } from './dataset'

export const AGG_LABEL: Record<AggFn, string> = {
  sum: '합계',
  mean: '평균',
  count: '건수',
  min: '최솟값',
  max: '최댓값',
}

export function isGroupable(col: Column): boolean {
  return col.role === 'dimension' || col.role === 'time' || col.role === 'year'
}

export function isTimeColumn(col: Column): boolean {
  return col.role === 'time' || col.role === 'year'
}

/** 행 i의 그룹 key. 차원 값이 없으면 null */
export function groupKeyOf(col: Column, i: number, grain: TimeGrain = 'year'): string | null {
  const v = col.values[i]
  if (v === null || v === undefined) return null
  if (col.type === 'date') {
    const d = new Date(v as number)
    const y = d.getUTCFullYear()
    if (grain === 'month') return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    return String(y)
  }
  return String(v)
}

export function allIndices(ds: Dataset): number[] {
  return Array.from({ length: ds.rowCount }, (_, i) => i)
}

/** 필터 적용: 각 열에 대해 허용된 그룹 key에 속한 행만 남긴다 (열 간 AND, 값 간 OR). */
export function applyFilters(ds: Dataset, filters: FilterState, grain: TimeGrain = 'year'): number[] {
  const active = Object.entries(filters)
    .filter(([, vals]) => vals.length > 0)
    .map(([key, vals]) => ({ col: ds.columns.find((c) => c.key === key), set: new Set(vals) }))
    .filter((f): f is { col: Column; set: Set<string> } => f.col !== undefined)
  if (active.length === 0) return allIndices(ds)
  const out: number[] = []
  for (let i = 0; i < ds.rowCount; i++) {
    let keep = true
    for (const f of active) {
      const k = groupKeyOf(f.col, i, grain)
      if (k === null || !f.set.has(k)) {
        keep = false
        break
      }
    }
    if (keep) out.push(i)
  }
  return out
}

export function numericValues(col: Column, indices: ArrayLike<number>): number[] {
  const out: number[] = []
  for (let j = 0; j < indices.length; j++) {
    const v = col.values[indices[j]]
    if (typeof v === 'number') out.push(v)
  }
  return out
}

export function statsFor(col: Column, indices: ArrayLike<number>): NumericStats | undefined {
  return computeStats(numericValues(col, indices))
}

function finalize(fn: AggFn, acc: { sum: number; n: number; min: number; max: number; rows: number }): number | null {
  if (fn === 'count') return acc.rows
  if (acc.n === 0) return null
  switch (fn) {
    case 'sum':
      return acc.sum
    case 'mean':
      return acc.sum / acc.n
    case 'min':
      return acc.min
    case 'max':
      return acc.max
  }
}

export interface GroupOptions {
  dimension: Column
  measure?: Column | null
  agg: AggFn
  grain?: TimeGrain
  indices: ArrayLike<number>
}

/**
 * 범주·시간별 집계.
 * - 차원 값이 비어 있는 행은 제외하고 개수를 보고한다.
 * - 수치가 모두 결측인 그룹의 값은 0이 아니라 null이다.
 * - count는 그룹의 행 수다.
 */
export function groupBy({ dimension, measure, agg, grain = 'year', indices }: GroupOptions): GroupResult {
  const groups = new Map<string, { sum: number; n: number; min: number; max: number; rows: number }>()
  let excludedMissingDimension = 0
  let excludedMissingMeasure = 0
  for (let j = 0; j < indices.length; j++) {
    const i = indices[j]
    const key = groupKeyOf(dimension, i, grain)
    if (key === null) {
      excludedMissingDimension++
      continue
    }
    let g = groups.get(key)
    if (!g) {
      g = { sum: 0, n: 0, min: Infinity, max: -Infinity, rows: 0 }
      groups.set(key, g)
    }
    g.rows++
    if (agg !== 'count' && measure) {
      const v = measure.values[i]
      if (typeof v === 'number') {
        g.sum += v
        g.n++
        if (v < g.min) g.min = v
        if (v > g.max) g.max = v
      } else excludedMissingMeasure++
    }
  }
  const time = isTimeColumn(dimension)
  const rows: AggRow[] = [...groups.entries()].map(([key, acc]) => ({
    key,
    label: key,
    sortKey: time ? (dimension.type === 'date' ? key : Number(key)) : key,
    value: finalize(agg, acc),
    validCount: agg === 'count' ? acc.rows : acc.n,
    rowCount: acc.rows,
  }))
  if (time) {
    rows.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
  } else {
    rows.sort((a, b) => {
      if (a.value === null && b.value === null) return a.key.localeCompare(b.key, 'ko')
      if (a.value === null) return 1
      if (b.value === null) return -1
      return b.value - a.value || a.key.localeCompare(b.key, 'ko')
    })
  }
  return { rows, excludedMissingDimension, excludedMissingMeasure, totalRows: indices.length }
}

/** 상위 N개만 남기고 나머지는 합계·건수일 때만 '기타'로 묶는다. */
export function limitGroups(rows: AggRow[], limit: number, agg: AggFn): { rows: AggRow[]; hidden: number } {
  if (rows.length <= limit) return { rows, hidden: 0 }
  const head = rows.slice(0, limit)
  const tail = rows.slice(limit)
  if (agg === 'sum' || agg === 'count') {
    let value: number | null = null
    let validCount = 0
    let rowCount = 0
    for (const r of tail) {
      if (r.value !== null) value = (value ?? 0) + r.value
      validCount += r.validCount
      rowCount += r.rowCount
    }
    head.push({ key: '__other__', label: `기타 ${tail.length}개`, sortKey: '~', value, validCount, rowCount })
  }
  return { rows: head, hidden: tail.length }
}

/**
 * 전년 대비 증감률. 직전 연도(연도-1) 값이 있어야 계산한다.
 * - 전년 값이 0이면 'zero-base'로 산출 불가
 * - 전년 데이터가 없으면 'no-prev'
 * - 증감률 = (올해 - 전년) / |전년|
 */
export function computeGrowth(rows: AggRow[]): GrowthRow[] {
  const byYear = new Map<number, AggRow>()
  for (const r of rows) {
    const y = Number(r.key)
    if (Number.isInteger(y)) byYear.set(y, r)
  }
  return rows.map((r) => {
    const y = Number(r.key)
    const prev = Number.isInteger(y) ? byYear.get(y - 1) : undefined
    const value = r.value
    const prevValue = prev?.value ?? null
    if (value === null) return { key: r.key, value, prevValue, growth: null, status: 'no-data' as const }
    if (!prev || prevValue === null) return { key: r.key, value, prevValue, growth: null, status: 'no-prev' as const }
    if (prevValue === 0) return { key: r.key, value, prevValue, growth: null, status: 'zero-base' as const }
    return { key: r.key, value, prevValue, growth: (value - prevValue) / Math.abs(prevValue), status: 'ok' as const }
  })
}

export const GROWTH_STATUS_LABEL: Record<GrowthRow['status'], string> = {
  ok: '',
  'zero-base': '산출 불가 (전년 값 0)',
  'no-prev': '산출 불가 (전년 데이터 없음)',
  'no-data': '산출 불가 (해당 연도 값 없음)',
}

export interface HistogramBin {
  from: number
  to: number
  count: number
}

export function histogram(col: Column, indices: ArrayLike<number>, maxBins = 20): HistogramBin[] {
  const nums = numericValues(col, indices)
  if (nums.length === 0) return []
  let min = Infinity
  let max = -Infinity
  for (const n of nums) {
    if (n < min) min = n
    if (n > max) max = n
  }
  if (min === max) return [{ from: min, to: max, count: nums.length }]
  const bins = Math.min(maxBins, Math.max(5, Math.ceil(Math.log2(nums.length) + 1)))
  const width = (max - min) / bins
  const out: HistogramBin[] = Array.from({ length: bins }, (_, b) => ({ from: min + b * width, to: min + (b + 1) * width, count: 0 }))
  for (const n of nums) {
    const b = Math.min(bins - 1, Math.floor((n - min) / width))
    out[b].count++
  }
  return out
}

export interface ScatterResult {
  points: [number, number][]
  pairs: number
  correlation: number | null
  sampled: boolean
}

/** 두 수치 열의 산점도 데이터와 피어슨 상관계수 (둘 다 값이 있는 행만) */
export function scatter(x: Column, y: Column, indices: ArrayLike<number>, maxPoints = 2000): ScatterResult {
  const xs: number[] = []
  const ys: number[] = []
  for (let j = 0; j < indices.length; j++) {
    const i = indices[j]
    const a = x.values[i]
    const b = y.values[i]
    if (typeof a === 'number' && typeof b === 'number') {
      xs.push(a)
      ys.push(b)
    }
  }
  const n = xs.length
  let correlation: number | null = null
  if (n >= 3) {
    const mx = xs.reduce((s, v) => s + v, 0) / n
    const my = ys.reduce((s, v) => s + v, 0) / n
    let sxy = 0
    let sxx = 0
    let syy = 0
    for (let k = 0; k < n; k++) {
      sxy += (xs[k] - mx) * (ys[k] - my)
      sxx += (xs[k] - mx) ** 2
      syy += (ys[k] - my) ** 2
    }
    correlation = sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy)
  }
  const step = n > maxPoints ? n / maxPoints : 1
  const points: [number, number][] = []
  for (let k = 0; k < n; k += step) points.push([xs[Math.floor(k)], ys[Math.floor(k)]])
  return { points, pairs: n, correlation, sampled: step > 1 }
}

export interface CrossTab {
  categories: string[]
  series: { key: string; values: (number | null)[] }[]
}

/** 두 차원 교차 집계 (누적 막대용). 상위 범주·계열만 사용한다. */
export function crossTab(
  dim: Column,
  seriesCol: Column,
  measure: Column | null,
  agg: AggFn,
  indices: ArrayLike<number>,
  grain: TimeGrain = 'year',
  limits = { categories: 10, series: 6 },
): CrossTab {
  const dimRows = limitGroups(groupBy({ dimension: dim, measure, agg, grain, indices }).rows, limits.categories, 'mean').rows
  const serRows = limitGroups(groupBy({ dimension: seriesCol, measure, agg, grain, indices }).rows, limits.series, 'mean').rows
  const categories = dimRows.map((r) => r.key)
  const catIdx = new Map(categories.map((c, i) => [c, i]))
  const series = serRows.map((s) => ({ key: s.key, values: categories.map(() => null as number | null) }))
  const serIdx = new Map(series.map((s, i) => [s.key, i]))
  const acc = new Map<string, { sum: number; n: number; min: number; max: number; rows: number }>()
  for (let j = 0; j < indices.length; j++) {
    const i = indices[j]
    const dk = groupKeyOf(dim, i, grain)
    const sk = groupKeyOf(seriesCol, i, grain)
    if (dk === null || sk === null || !catIdx.has(dk) || !serIdx.has(sk)) continue
    const k = `${dk}\u0000${sk}`
    let a = acc.get(k)
    if (!a) {
      a = { sum: 0, n: 0, min: Infinity, max: -Infinity, rows: 0 }
      acc.set(k, a)
    }
    a.rows++
    if (measure && agg !== 'count') {
      const v = measure.values[i]
      if (typeof v === 'number') {
        a.sum += v
        a.n++
        a.min = Math.min(a.min, v)
        a.max = Math.max(a.max, v)
      }
    }
  }
  for (const [k, a] of acc) {
    const [dk, sk] = k.split('\u0000')
    series[serIdx.get(sk)!].values[catIdx.get(dk)!] = finalize(agg, a)
  }
  return { categories, series }
}
