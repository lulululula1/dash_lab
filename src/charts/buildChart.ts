import {
  AGG_LABEL,
  GROWTH_STATUS_LABEL,
  applyFilters,
  computeGrowth,
  crossTab,
  groupBy,
  histogram,
  isTimeColumn,
  limitGroups,
  scatter,
} from '../engine/aggregate'
import type { AggRow, ChartSpec, Column, Dataset, FilterState, GrowthRow } from '../types/data'
import { compactKo, formatNumber, formatPercent, formatShare } from '../utils/format'
import { PALETTE, type ChartOption } from './echarts'

export interface ChartContext {
  decimals: number
  compact: boolean
  maxCategories: number
}

export interface TableRow {
  key: string
  label: string
  value: number | null
  share: number | null
  rowCount: number
  validCount: number
  growth?: GrowthRow
}

export interface BuiltChart {
  option: ChartOption | null
  /** 집계 기준 (사용자에게 그대로 표시) */
  criteria: string[]
  notes: string[]
  /** 차트를 그릴 수 없는 이유 */
  empty?: string
  table: TableRow[]
  /** 클릭 시 필터를 걸 차원 열 */
  filterColumn?: Column
  selected: string[]
}

const AXIS_STYLE = {
  axisLine: { lineStyle: { color: 'rgba(103,232,249,0.25)' } },
  axisTick: { show: false },
  axisLabel: { color: '#8da2c8', fontSize: 11 },
  splitLine: { lineStyle: { color: 'rgba(103,232,249,0.07)' } },
}

const TOOLTIP = {
  backgroundColor: 'rgba(8,13,38,0.94)',
  borderColor: 'rgba(103,232,249,0.35)',
  borderWidth: 1,
  textStyle: { color: '#e6f1ff', fontSize: 12 },
  extraCssText: 'backdrop-filter: blur(8px); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);',
}

function filtersWithout(filters: FilterState, key?: string): FilterState {
  if (!key || !(key in filters)) return filters
  const next = { ...filters }
  delete next[key]
  return next
}

function col(ds: Dataset, key?: string): Column | undefined {
  return key ? ds.columns.find((c) => c.key === key) : undefined
}

function measureLabel(spec: ChartSpec, measure?: Column): string {
  return spec.agg === 'count' || !measure ? '건수(행 수)' : `${measure.name} ${AGG_LABEL[spec.agg]}`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/**
 * 차트 사양과 현재 필터로 ECharts 옵션·집계표·집계 기준을 만든다.
 * 차트 자신의 차원 필터는 제외하고 집계해(교차 필터) 선택한 항목을 강조 표시한다.
 */
export function buildChart(spec: ChartSpec, ds: Dataset, filters: FilterState, ctx: ChartContext): BuiltChart {
  const dim = col(ds, spec.dimensionKey)
  const measure = col(ds, spec.measureKey)
  const fmt = (n: number) => formatNumber(n, { decimals: ctx.decimals })
  const axisFmt = (n: number) => (ctx.compact ? compactKo(n, 1) : n.toLocaleString('ko-KR'))
  const selected = dim ? (filters[dim.key] ?? []) : []
  // 필터는 항상 연 단위 key로 저장된다.
  const indices = applyFilters(ds, filtersWithout(filters, dim?.key))
  const criteria: string[] = []
  const notes: string[] = []
  const base: BuiltChart = { option: null, criteria, notes, table: [], filterColumn: dim && spec.kind !== 'histogram' && spec.timeGrain !== 'month' ? dim : undefined, selected }

  const filteredCount = indices.length
  criteria.push(`대상 행: ${filteredCount.toLocaleString('ko-KR')} / 전체 ${ds.rowCount.toLocaleString('ko-KR')}행${filteredCount < ds.rowCount ? ' (필터 적용)' : ''}`)
  if (filteredCount === 0) return { ...base, empty: '현재 필터 조건에 해당하는 행이 없습니다.' }

  if (spec.kind === 'scatter') {
    const x = col(ds, spec.xMeasureKey)
    if (!x || !measure) return { ...base, empty: '산점도에 필요한 수치 열을 찾을 수 없습니다.' }
    const sc = scatter(x, measure, indices)
    criteria.push(`X축: ${x.name}, Y축: ${measure.name} — 두 값이 모두 있는 ${sc.pairs.toLocaleString('ko-KR')}행`)
    if (sc.correlation !== null) criteria.push(`피어슨 상관계수 r = ${sc.correlation.toFixed(3)} (상관 ≠ 인과)`)
    else criteria.push('상관계수: 산출 불가 (유효 쌍 3개 미만 또는 값 변동 없음)')
    if (sc.sampled) notes.push(`표시 성능을 위해 ${sc.points.length.toLocaleString('ko-KR')}개 점만 균등 추출해 그렸습니다. 상관계수는 전체 쌍으로 계산했습니다.`)
    if (sc.pairs === 0) return { ...base, empty: '두 열에 동시에 값이 있는 행이 없습니다.' }
    return {
      ...base,
      filterColumn: undefined,
      option: {
        grid: { left: 56, right: 18, top: 18, bottom: 42 },
        tooltip: { ...TOOLTIP, trigger: 'item', formatter: (p: { value: [number, number] }) => `${escapeHtml(x.name)}: ${fmt(p.value[0])}<br/>${escapeHtml(measure.name)}: ${fmt(p.value[1])}` },
        xAxis: { type: 'value', name: x.name, nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: '#8da2c8' }, scale: true, ...AXIS_STYLE, axisLabel: { ...AXIS_STYLE.axisLabel, formatter: axisFmt } },
        yAxis: { type: 'value', scale: true, ...AXIS_STYLE, axisLabel: { ...AXIS_STYLE.axisLabel, formatter: axisFmt } },
        series: [
          {
            type: 'scatter',
            data: sc.points,
            symbolSize: 7,
            itemStyle: { color: 'rgba(167,139,250,0.75)', borderColor: 'rgba(34,211,238,0.8)', borderWidth: 0.6, shadowBlur: 8, shadowColor: 'rgba(167,139,250,0.5)' },
            emphasis: { scale: 1.8 },
          },
        ],
      },
    }
  }

  if (spec.kind === 'histogram') {
    if (!measure) return { ...base, empty: '수치 열을 찾을 수 없습니다.' }
    const bins = histogram(measure, indices)
    const valid = bins.reduce((s, b) => s + b.count, 0)
    criteria.push(`'${measure.name}' 유효 값 ${valid.toLocaleString('ko-KR')}개를 ${bins.length}개 구간으로 나눔 (결측·오류 제외)`)
    if (bins.length === 0) return { ...base, empty: '유효한 수치 값이 없습니다.' }
    const labels = bins.map((b) => `${fmt(b.from)}~${fmt(b.to)}`)
    return {
      ...base,
      table: bins.map((b, i) => ({ key: labels[i], label: labels[i], value: b.count, share: valid ? b.count / valid : null, rowCount: b.count, validCount: b.count })),
      option: {
        grid: { left: 48, right: 14, top: 18, bottom: 54 },
        tooltip: { ...TOOLTIP, trigger: 'axis', axisPointer: { type: 'shadow' } },
        xAxis: { type: 'category', data: labels, ...AXIS_STYLE, axisLabel: { ...AXIS_STYLE.axisLabel, rotate: 30, fontSize: 10 } },
        yAxis: { type: 'value', name: '빈도', nameTextStyle: { color: '#8da2c8' }, ...AXIS_STYLE },
        series: [
          {
            type: 'bar',
            name: '빈도',
            data: bins.map((b) => b.count),
            barCategoryGap: '8%',
            itemStyle: { borderRadius: [4, 4, 0, 0], color: gradient('#a78bfa', '#38bdf8') },
          },
        ],
      },
    }
  }

  if (!dim) return { ...base, empty: '집계 기준 열을 찾을 수 없습니다.' }
  const res = groupBy({ dimension: dim, measure: measure ?? null, agg: spec.agg, grain: spec.timeGrain, indices })
  criteria.push(`집계: ${measureLabel(spec, measure)} · 기준 열: ${dim.name}${dim.type === 'date' ? ` (${spec.timeGrain === 'month' ? '월' : '연'} 단위)` : ''}`)
  if (res.excludedMissingDimension > 0) criteria.push(`'${dim.name}' 값이 비어 제외된 행: ${res.excludedMissingDimension.toLocaleString('ko-KR')}`)
  if (spec.agg !== 'count' && res.excludedMissingMeasure > 0 && measure) {
    criteria.push(`'${measure.name}' 결측·오류로 집계에서 빠진 행: ${res.excludedMissingMeasure.toLocaleString('ko-KR')} (0으로 계산하지 않음)`)
  }
  if (res.rows.length === 0) return { ...base, empty: '집계할 값이 없습니다.' }
  const total = res.rows.reduce((s, r) => s + (r.value ?? 0), 0)
  const canShare = spec.agg === 'sum' || spec.agg === 'count'
  const time = isTimeColumn(dim)
  const growth = time && (dim.role === 'year' || spec.timeGrain !== 'month') ? computeGrowth(res.rows) : undefined
  const table: TableRow[] = res.rows.map((r, i) => ({
    key: r.key,
    label: r.label,
    value: r.value,
    share: canShare && total > 0 && r.value !== null ? r.value / total : null,
    rowCount: r.rowCount,
    validCount: r.validCount,
    growth: growth?.[i],
  }))
  const out = { ...base, table }

  if (spec.kind === 'stackedBar') {
    const sCol = col(ds, spec.seriesKey)
    if (!sCol) return { ...out, empty: '계열 열을 찾을 수 없습니다.' }
    const ct = crossTab(dim, sCol, measure ?? null, spec.agg, indices, spec.timeGrain, { categories: 20, series: 6 })
    criteria.push(`계열: ${sCol.name} (상위 ${ct.series.length}개)`)
    return {
      ...out,
      option: {
        grid: { left: 52, right: 14, top: 40, bottom: 30 },
        legend: { top: 0, textStyle: { color: '#8da2c8', fontSize: 11 }, itemWidth: 10, itemHeight: 10, type: 'scroll' },
        tooltip: { ...TOOLTIP, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: unknown) => (typeof v === 'number' ? fmt(v) : '값 없음') },
        xAxis: { type: 'category', data: ct.categories, ...AXIS_STYLE },
        yAxis: { type: 'value', ...AXIS_STYLE, axisLabel: { ...AXIS_STYLE.axisLabel, formatter: axisFmt } },
        series: ct.series.map((s, i) => ({
          type: 'bar',
          name: s.key,
          stack: 'total',
          data: s.values.map((v, ci) => ({ value: v, itemStyle: { opacity: selected.length && !selected.includes(ct.categories[ci]) ? 0.25 : 1 } })),
          itemStyle: { color: PALETTE[i % PALETTE.length], borderRadius: i === ct.series.length - 1 ? [4, 4, 0, 0] : 0 },
          emphasis: { focus: 'series' },
        })),
      },
    }
  }

  if (spec.kind === 'line' || time) {
    const labels = res.rows.map((r) => r.label)
    const avg = res.rows.filter((r) => r.value !== null)
    const growthFmt = (g?: GrowthRow) => (!g ? '' : g.status === 'ok' ? `전년 대비 ${formatPercent(g.growth)}` : GROWTH_STATUS_LABEL[g.status])
    if (growth) criteria.push('증감률 = (해당 연도 − 전년) ÷ |전년| — 전년 값이 0이거나 없으면 산출하지 않음')
    return {
      ...out,
      option: {
        grid: { left: 54, right: 44, top: 24, bottom: 30 },
        tooltip: {
          ...TOOLTIP,
          trigger: 'axis',
          formatter: (ps: { dataIndex: number }[]) => {
            const i = ps[0]?.dataIndex ?? 0
            const r = res.rows[i]
            const g = growth?.[i]
            return `<b>${escapeHtml(r.label)}</b><br/>${escapeHtml(measureLabel(spec, measure))}: ${r.value === null ? '값 없음' : fmt(r.value)}${g ? `<br/><span style="color:#8da2c8">${growthFmt(g)}</span>` : ''}<br/><span style="color:#5b6b91">유효 ${r.validCount}건 / ${r.rowCount}행</span>`
          },
        },
        xAxis: { type: 'category', data: labels, boundaryGap: false, ...AXIS_STYLE },
        yAxis: { type: 'value', ...AXIS_STYLE, axisLabel: { ...AXIS_STYLE.axisLabel, formatter: axisFmt } },
        series: [
          {
            type: 'line',
            name: measureLabel(spec, measure),
            data: res.rows.map((r) => ({
              value: r.value,
              itemStyle: selected.length && !selected.includes(r.key) ? { opacity: 0.3 } : undefined,
              symbolSize: selected.includes(r.key) ? 14 : 8,
            })),
            smooth: 0.3,
            connectNulls: false,
            symbol: 'circle',
            lineStyle: { width: 3, color: gradientH('#22d3ee', '#a78bfa'), shadowBlur: 14, shadowColor: 'rgba(34,211,238,0.55)' },
            itemStyle: { color: '#67e8f9', borderColor: '#050816', borderWidth: 2 },
            areaStyle: { color: gradient('rgba(34,211,238,0.32)', 'rgba(124,58,237,0.02)') },
            markLine:
              avg.length > 1
                ? {
                    silent: true,
                    symbol: 'none',
                    lineStyle: { color: 'rgba(167,139,250,0.5)', type: 'dashed' },
                    label: { color: '#a78bfa', fontSize: 10, formatter: '평균' },
                    data: [{ type: 'average' }],
                  }
                : undefined,
          },
        ],
      },
    }
  }

  const limited = limitGroups(res.rows, ctx.maxCategories, spec.agg)
  if (limited.hidden > 0) {
    notes.push(
      canShare
        ? `상위 ${ctx.maxCategories}개 범주만 표시하고 나머지 ${limited.hidden}개는 '기타'로 합산했습니다.`
        : `상위 ${ctx.maxCategories}개 범주만 표시했습니다 (나머지 ${limited.hidden}개 생략 — ${AGG_LABEL[spec.agg]}은 합산할 수 없음).`,
    )
  }
  const rows: AggRow[] = limited.rows
  const isSel = (k: string) => selected.length === 0 || selected.includes(k)

  if (spec.kind === 'pie') {
    if (!canShare) return { ...out, empty: '구성비 차트는 합계·건수 집계에서만 사용할 수 있습니다.' }
    if (rows.some((r) => (r.value ?? 0) < 0)) return { ...out, empty: '음수 값이 있어 구성비를 표시할 수 없습니다.' }
    return {
      ...out,
      option: {
        tooltip: {
          ...TOOLTIP,
          trigger: 'item',
          formatter: (p: { name: string; value: number; percent: number }) => `<b>${escapeHtml(p.name)}</b><br/>${fmt(p.value)} (${p.percent.toFixed(1)}%)`,
        },
        legend: { orient: 'vertical', right: 4, top: 'middle', textStyle: { color: '#8da2c8', fontSize: 11 }, itemWidth: 10, itemHeight: 10, type: 'scroll' },
        series: [
          {
            type: 'pie',
            radius: ['48%', '74%'],
            center: ['38%', '52%'],
            padAngle: 2,
            itemStyle: { borderRadius: 6, borderColor: '#050816', borderWidth: 2 },
            label: { show: false },
            emphasis: { scale: true, scaleSize: 8, label: { show: true, color: '#e6f1ff', fontSize: 13, fontWeight: 600, formatter: '{b}\n{d}%' } },
            data: rows.map((r, i) => ({
              name: r.label,
              value: r.value ?? 0,
              itemStyle: { color: r.key === '__other__' ? '#475569' : PALETTE[i % PALETTE.length], opacity: isSel(r.key) ? 1 : 0.25 },
              selected: selected.includes(r.key),
            })),
          },
        ],
      },
    }
  }

  // 범주형 가로 막대
  return {
    ...out,
    option: {
      grid: { left: 8, right: 56, top: 10, bottom: 10, containLabel: true },
      tooltip: {
        ...TOOLTIP,
        trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const r = rows[p.dataIndex]
          const share = canShare && total > 0 && r.value !== null ? ` (${formatShare(r.value / total)})` : ''
          return `<b>${escapeHtml(r.label)}</b><br/>${escapeHtml(measureLabel(spec, measure))}: ${r.value === null ? '값 없음' : fmt(r.value)}${share}<br/><span style="color:#5b6b91">유효 ${r.validCount}건 / ${r.rowCount}행</span>`
        },
      },
      xAxis: { type: 'value', ...AXIS_STYLE, axisLabel: { ...AXIS_STYLE.axisLabel, formatter: axisFmt } },
      yAxis: { type: 'category', inverse: true, data: rows.map((r) => r.label), ...AXIS_STYLE, axisLabel: { ...AXIS_STYLE.axisLabel, width: 110, overflow: 'truncate' } },
      series: [
        {
          type: 'bar',
          name: measureLabel(spec, measure),
          barMaxWidth: 22,
          data: rows.map((r, i) => ({
            value: r.value,
            itemStyle: {
              color: r.key === '__other__' ? '#475569' : gradientH(i === 0 ? '#22d3ee' : '#38bdf8', '#a78bfa'),
              opacity: isSel(r.key) ? 1 : 0.25,
              borderRadius: [0, 6, 6, 0],
              shadowBlur: selected.includes(r.key) ? 16 : 0,
              shadowColor: 'rgba(34,211,238,0.8)',
            },
          })),
          label: { show: true, position: 'right', color: '#8da2c8', fontSize: 10, formatter: (p: { value: number | null }) => (p.value === null ? '없음' : axisFmt(p.value)) },
          showBackground: true,
          backgroundStyle: { color: 'rgba(103,232,249,0.04)', borderRadius: [0, 6, 6, 0] },
        },
      ],
    },
  }
}

function gradient(top: string, bottom: string) {
  return { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: top }, { offset: 1, color: bottom }] }
}
function gradientH(left: string, right: string) {
  return { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: left }, { offset: 1, color: right }] }
}
