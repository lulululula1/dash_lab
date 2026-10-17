import gsap from 'gsap'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildChart, type TableRow } from '../charts/buildChart'
import { EChart } from '../components/EChart'
import { CHART_LABEL } from '../components/labels'
import { Icon } from '../components/ui'
import { AGG_LABEL, GROWTH_STATUS_LABEL, isGroupable } from '../engine/aggregate'
import { defaultAgg, rankMeasures } from '../engine/recommend'
import { useMotionScale } from '../hooks/useMotion'
import { useSettings } from '../state/settings'
import type { AggFn, ChartKind, ChartSpec, Dataset, FilterState } from '../types/data'
import { formatNumber, formatPercent, formatShare } from '../utils/format'

interface Props {
  spec: ChartSpec
  ds: Dataset
  filters: FilterState
  onToggleFilter: (colKey: string, value: string) => void
  onApply: (spec: ChartSpec) => void
  onClose: () => void
}

function autoTitle(s: ChartSpec, ds: Dataset): string {
  const name = (k?: string) => ds.columns.find((c) => c.key === k)?.name ?? ''
  const m = s.agg === 'count' || !s.measureKey ? '건수' : `${name(s.measureKey)} ${AGG_LABEL[s.agg]}`
  switch (s.kind) {
    case 'scatter':
      return `${name(s.xMeasureKey)} × ${name(s.measureKey)} 관계`
    case 'histogram':
      return `${name(s.measureKey)} 분포`
    case 'stackedBar':
      return `${name(s.dimensionKey)}·${name(s.seriesKey)}별 ${m}`
    case 'pie':
      return `${name(s.dimensionKey)}별 ${m} 구성비`
    default:
      return `${name(s.dimensionKey)}별 ${m}${s.kind === 'line' ? ' 추이' : ''}`
  }
}

/** 차트 유형을 바꿀 때 필요한 열이 비어 있으면 기본값으로 채운다. */
function normalize(s: ChartSpec, ds: Dataset): ChartSpec {
  const measures = rankMeasures(ds)
  const groupables = ds.columns.filter((c) => isGroupable(c) && c.distinct >= 2)
  const next = { ...s }
  if (next.kind === 'scatter') {
    next.xMeasureKey = next.xMeasureKey ?? measures[0]?.key
    if (!next.measureKey || next.measureKey === next.xMeasureKey) next.measureKey = measures.find((m) => m.key !== next.xMeasureKey)?.key
  } else if (next.kind === 'histogram') {
    next.measureKey = next.measureKey ?? measures[0]?.key
    next.agg = 'count'
  } else {
    if (!next.dimensionKey || !groupables.some((g) => g.key === next.dimensionKey)) next.dimensionKey = groupables[0]?.key
    if (next.kind === 'stackedBar' && (!next.seriesKey || next.seriesKey === next.dimensionKey)) {
      next.seriesKey = groupables.find((g) => g.key !== next.dimensionKey && g.role === 'dimension')?.key
    }
    if (next.kind === 'pie' && next.agg !== 'sum' && next.agg !== 'count') next.agg = next.measureKey ? 'sum' : 'count'
    if (!next.measureKey) next.agg = 'count'
  }
  next.title = autoTitle(next, ds)
  return next
}

function toCsv(rows: TableRow[], valueLabel: string): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = [['항목', valueLabel, '비중', '전년 대비', '유효 값 수', '행 수'].join(',')]
  for (const r of rows) {
    const g = r.growth
    lines.push(
      [
        esc(r.label),
        r.value === null ? '' : String(r.value),
        r.share === null ? '' : (r.share * 100).toFixed(2) + '%',
        !g ? '' : g.status === 'ok' ? ((g.growth ?? 0) * 100).toFixed(2) + '%' : GROWTH_STATUS_LABEL[g.status],
        String(r.validCount),
        String(r.rowCount),
      ].join(','),
    )
  }
  return '﻿' + lines.join('\r\n')
}

export function DetailPanel({ spec, ds, filters, onToggleFilter, onApply, onClose }: Props) {
  const { settings } = useSettings()
  const scale = useMotionScale()
  const [draft, setDraft] = useState<ChartSpec>(spec)
  const panel = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const measures = useMemo(() => rankMeasures(ds), [ds])
  const groupables = useMemo(() => ds.columns.filter((c) => isGroupable(c) && c.distinct >= 2), [ds])
  const dims = groupables.filter((g) => g.role === 'dimension')
  const dimCol = ds.columns.find((c) => c.key === draft.dimensionKey)
  const built = useMemo(
    () => buildChart(draft, ds, filters, { decimals: settings.decimals, compact: settings.compactNumbers, maxCategories: settings.maxCategories }),
    [draft, ds, filters, settings.decimals, settings.compactNumbers, settings.maxCategories],
  )
  const changed = JSON.stringify(draft) !== JSON.stringify(spec)
  const fmt = (n: number | null) => formatNumber(n, { decimals: Math.max(settings.decimals, 2) })

  const update = (patch: Partial<ChartSpec>) => setDraft((d) => normalize({ ...d, ...patch }, ds))

  const close = () => {
    if (scale === 0 || !panel.current) return onClose()
    gsap.to(backdrop.current, { opacity: 0, duration: 0.25 * scale })
    gsap.to(panel.current, { x: 60, opacity: 0, duration: 0.3 * scale, ease: 'power2.in', onComplete: onClose })
  }

  useLayoutEffect(() => {
    if (scale === 0) return
    // StrictMode의 이중 실행에도 최종 상태가 보장되도록 fromTo + revert를 사용한다.
    const ctx = gsap.context(() => {
      gsap.fromTo(backdrop.current, { opacity: 0 }, { opacity: 1, duration: 0.3 * scale })
      gsap.fromTo(panel.current, { x: 80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5 * scale, ease: 'power3.out' })
    })
    return () => ctx.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const download = () => {
    const valueLabel = draft.agg === 'count' || !draft.measureKey ? '건수' : `${ds.columns.find((c) => c.key === draft.measureKey)?.name} ${AGG_LABEL[draft.agg]}`
    const blob = new Blob([toCsv(built.table, valueLabel)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${draft.title.replace(/[\\/:*?"<>|]/g, '_')}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const kinds: ChartKind[] = ['bar', 'line', 'pie', 'stackedBar', 'histogram', 'scatter'].filter((k) => {
    if (k === 'scatter') return measures.length >= 2
    if (k === 'histogram') return measures.length >= 1
    if (k === 'stackedBar') return groupables.length >= 2 && dims.length >= 1
    return groupables.length >= 1
  }) as ChartKind[]
  const usesDim = draft.kind !== 'scatter' && draft.kind !== 'histogram'
  const aggs: AggFn[] = !draft.measureKey ? ['count'] : draft.kind === 'pie' ? ['sum', 'count'] : ['sum', 'mean', 'max', 'min', 'count']
  const showGrowth = built.table.some((r) => r.growth)

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="차트 상세 분석">
      <div ref={backdrop} className="absolute inset-0 bg-void/70 backdrop-blur-sm" onClick={close} />
      <div ref={panel} tabIndex={-1} className="relative w-full max-w-4xl h-full overflow-y-auto scroll-thin glass rounded-none! sm:rounded-l-3xl! border-r-0! outline-none">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 sm:px-7 py-4 bg-deep/85 backdrop-blur-md border-b border-cyan/10">
          <div className="min-w-0">
            <div className="panel-title">DETAIL ANALYSIS</div>
            <h2 className="text-lg font-bold truncate">{draft.title}</h2>
          </div>
          <button className="btn btn-ghost btn-icon shrink-0" onClick={close} aria-label="닫기">
            <Icon name="close" />
          </button>
        </div>

        <div className="p-5 sm:p-7 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs text-muted space-y-1">
              <span>차트 유형</span>
              <select className="select w-full" value={draft.kind} onChange={(e) => update({ kind: e.target.value as ChartKind })}>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {CHART_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            {usesDim && (
              <label className="text-xs text-muted space-y-1">
                <span>기준 열 (X축·범주)</span>
                <select className="select w-full" value={draft.dimensionKey} onChange={(e) => update({ dimensionKey: e.target.value, timeGrain: 'year' })}>
                  {groupables.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {draft.kind === 'scatter' && (
              <label className="text-xs text-muted space-y-1">
                <span>X축 수치</span>
                <select className="select w-full" value={draft.xMeasureKey} onChange={(e) => update({ xMeasureKey: e.target.value })}>
                  {measures.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs text-muted space-y-1">
              <span>{draft.kind === 'scatter' ? 'Y축 수치' : '값 열'}</span>
              <select
                className="select w-full"
                value={draft.measureKey ?? ''}
                onChange={(e) => {
                  const key = e.target.value || undefined
                  const m = measures.find((c) => c.key === key)
                  update({ measureKey: key, agg: key ? defaultAgg(m) : 'count' })
                }}
              >
                {usesDim && <option value="">(건수 — 행 수)</option>}
                {measures.map((c) => (
                  <option key={c.key} value={c.key} disabled={draft.kind === 'scatter' && c.key === draft.xMeasureKey}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {usesDim && (
              <label className="text-xs text-muted space-y-1">
                <span>집계 방식</span>
                <select className="select w-full" value={draft.agg} onChange={(e) => update({ agg: e.target.value as AggFn })}>
                  {aggs.map((a) => (
                    <option key={a} value={a}>
                      {AGG_LABEL[a]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {usesDim && dimCol?.type === 'date' && (
              <label className="text-xs text-muted space-y-1">
                <span>시간 단위</span>
                <select className="select w-full" value={draft.timeGrain ?? 'year'} onChange={(e) => update({ timeGrain: e.target.value as 'year' | 'month' })}>
                  <option value="year">연</option>
                  <option value="month">월</option>
                </select>
              </label>
            )}
            {draft.kind === 'stackedBar' && (
              <label className="text-xs text-muted space-y-1">
                <span>계열 (누적 기준)</span>
                <select className="select w-full" value={draft.seriesKey} onChange={(e) => update({ seriesKey: e.target.value })}>
                  {dims
                    .filter((c) => c.key !== draft.dimensionKey)
                    .map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>

          <div className="glass p-4 h-[360px] sm:h-[420px] relative">
            {built.option ? (
              <EChart
                option={built.option}
                className="absolute inset-3"
                ariaLabel={`${draft.title} 상세 차트`}
                onClick={
                  built.filterColumn
                    ? (e) => {
                        const row = built.table.find((r) => r.label === e.name)
                        if (row && row.key !== '__other__') onToggleFilter(built.filterColumn!.key, row.key)
                      }
                    : undefined
                }
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-muted text-sm px-6 text-center">{built.empty}</div>
            )}
          </div>

          <div className="rounded-xl border border-cyan/15 bg-deep/50 p-4 text-xs text-muted space-y-1">
            <div className="flex items-center gap-2 text-ink text-sm font-medium mb-1">
              <Icon name="info" size={15} className="text-cyan" />
              집계 기준
            </div>
            {built.criteria.map((c) => (
              <div key={c}>· {c}</div>
            ))}
            {built.notes.map((n) => (
              <div key={n} className="text-warn/90">
                · {n}
              </div>
            ))}
            <div className="text-dim pt-1">· 모든 값은 업로드한 데이터에서 직접 계산했습니다 (규칙 기반, AI 미사용).</div>
          </div>

          {built.table.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icon name="table" size={15} className="text-cyan" />
                  집계표 <span className="text-dim text-xs">({built.table.length}개 항목)</span>
                </div>
                <button className="btn btn-ghost text-xs py-1.5!" onClick={download}>
                  <Icon name="download" size={14} />
                  CSV 저장
                </button>
              </div>
              <div className="overflow-auto scroll-thin max-h-96 rounded-xl border border-cyan/10">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>항목</th>
                      <th className="text-right">값</th>
                      <th className="text-right">비중</th>
                      {showGrowth && <th className="text-right">전년 대비</th>}
                      <th className="text-right">유효 / 행</th>
                    </tr>
                  </thead>
                  <tbody>
                    {built.table.map((r) => (
                      <tr key={r.key} className={built.selected.includes(r.key) ? 'text-cyan' : ''}>
                        <td className="font-medium">{r.label}</td>
                        <td className="text-right mono">{r.value === null ? <span className="text-dim">값 없음</span> : fmt(r.value)}</td>
                        <td className="text-right mono text-muted">{formatShare(r.share)}</td>
                        {showGrowth && (
                          <td className={`text-right mono ${r.growth?.growth == null ? 'text-dim' : r.growth.growth >= 0 ? 'text-ok' : 'text-bad'}`}>
                            {r.growth?.status === 'ok' ? formatPercent(r.growth.growth) : r.growth ? <span className="text-[0.7rem]">{GROWTH_STATUS_LABEL[r.growth.status]}</span> : '—'}
                          </td>
                        )}
                        <td className="text-right mono text-dim">
                          {r.validCount.toLocaleString('ko-KR')} / {r.rowCount.toLocaleString('ko-KR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2 pb-6">
            <button className="btn btn-ghost" onClick={() => setDraft(spec)} disabled={!changed}>
              되돌리기
            </button>
            <button
              className="btn btn-primary"
              disabled={!changed}
              onClick={() => {
                onApply(draft)
                close()
              }}
            >
              대시보드에 적용
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
