import { useCallback, useMemo, type ReactNode } from 'react'
import { AGG_LABEL, GROWTH_STATUS_LABEL, computeGrowth, groupBy, statsFor } from '../../engine/aggregate'
import { defaultAgg, timeColumns } from '../../engine/recommend'
import { useSettings } from '../../state/settings'
import type { Column, Dataset } from '../../types/data'
import { formatNumber, formatPercent } from '../../utils/format'
import { CountUp, GlassPanel } from '../ui'

interface Props {
  ds: Dataset
  indices: number[]
  measure: Column | undefined
  measures: Column[]
  onMeasure: (key: string) => void
}

function Tile({ label, children, caption, accent = 'cyan' }: { label: string; children: ReactNode; caption?: string; accent?: 'cyan' | 'violet' | 'ok' | 'bad' | 'warn' }) {
  const color = { cyan: 'text-cyan', violet: 'text-violet', ok: 'text-ok', bad: 'text-bad', warn: 'text-warn' }[accent]
  return (
    <GlassPanel data-anim className="p-4 min-w-0 overflow-hidden">
      <div className="text-[0.72rem] text-muted truncate">{label}</div>
      <div className={`mt-1.5 text-2xl xl:text-[1.7rem] font-bold mono leading-tight truncate ${color}`}>{children}</div>
      {caption && <div className="mt-1 text-[0.68rem] text-dim truncate" title={caption}>{caption}</div>}
    </GlassPanel>
  )
}

export function KpiRow({ ds, indices, measure, measures, onMeasure }: Props) {
  const { settings } = useSettings()
  const fmt = useCallback((n: number) => formatNumber(n, { decimals: settings.decimals, compact: settings.compactNumbers }), [settings.decimals, settings.compactNumbers])
  const fmtInt = useCallback((n: number) => Math.round(n).toLocaleString('ko-KR'), [])
  const stats = useMemo(() => (measure ? statsFor(measure, indices) : undefined), [measure, indices])
  const agg = defaultAgg(measure)
  const time = timeColumns(ds)[0]

  const growth = useMemo(() => {
    if (!measure || !time) return null
    const rows = groupBy({ dimension: time, measure, agg, indices }).rows
    return computeGrowth(rows).at(-1) ?? null
  }, [measure, time, agg, indices])

  const validLabel = measure ? `유효 ${stats?.count.toLocaleString('ko-KR') ?? 0}건 · 결측·오류 제외` : ''

  return (
    <div className="space-y-3">
      {measures.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>대표 수치</span>
          <select className="select py-1! text-xs!" value={measure?.key} onChange={(e) => onMeasure(e.target.value)} aria-label="대표 수치 열 선택">
            {measures.map((m) => (
              <option key={m.key} value={m.key}>
                {m.name}
              </option>
            ))}
          </select>
          {measure && agg === 'mean' && <span className="text-dim">비율·점수형 수치로 판단해 평균을 우선 표시</span>}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile label="분석 대상 행" caption={indices.length < ds.rowCount ? `전체 ${ds.rowCount.toLocaleString('ko-KR')}행 중 필터 적용` : '전체 데이터'}>
          <CountUp value={indices.length} format={fmtInt} />
        </Tile>
        {measure ? (
          <>
            <Tile label={`${measure.name} ${agg === 'sum' ? '합계' : '평균'}`} caption={validLabel} accent="violet">
              <CountUp value={stats ? (agg === 'sum' ? stats.sum : stats.mean) : null} format={fmt} />
            </Tile>
            <Tile label={`${measure.name} ${agg === 'sum' ? '평균' : '중앙값'}`} caption={validLabel}>
              <CountUp value={stats ? (agg === 'sum' ? stats.mean : stats.median) : null} format={fmt} />
            </Tile>
            <Tile label={`${measure.name} 최댓값`} caption={validLabel}>
              <CountUp value={stats?.max ?? null} format={fmt} />
            </Tile>
            <Tile label={`${measure.name} 최솟값`} caption={validLabel}>
              <CountUp value={stats?.min ?? null} format={fmt} />
            </Tile>
            <Tile
              label={growth ? `${growth.key}년 전년 대비 (${AGG_LABEL[agg]})` : '전년 대비 증감률'}
              caption={!time ? '연도·날짜 열 없음' : growth?.status === 'ok' ? `${fmt(growth.prevValue ?? 0)} → ${fmt(growth.value ?? 0)}` : growth ? GROWTH_STATUS_LABEL[growth.status] : '데이터 없음'}
              accent={growth?.growth == null ? 'warn' : growth.growth >= 0 ? 'ok' : 'bad'}
            >
              {growth?.status === 'ok' ? <CountUp value={growth.growth} format={(n) => formatPercent(n)} /> : <span className="text-lg">산출 불가</span>}
            </Tile>
          </>
        ) : (
          <Tile label="수치 열" caption="합계·평균을 낼 숫자 열이 없습니다" accent="warn">
            <span className="text-lg">없음</span>
          </Tile>
        )}
      </div>
    </div>
  )
}
