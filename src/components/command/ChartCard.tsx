import { useMemo, useState } from 'react'
import { buildChart } from '../../charts/buildChart'
import { useSettings } from '../../state/settings'
import type { ChartSpec, Dataset, FilterState } from '../../types/data'
import { EChart } from '../EChart'
import { CHART_LABEL } from '../labels'
import { GlassPanel, Icon } from '../ui'

interface Props {
  spec: ChartSpec
  ds: Dataset
  filters: FilterState
  onToggleFilter: (colKey: string, value: string) => void
  onExpand: () => void
  className?: string
}

export function ChartCard({ spec, ds, filters, onToggleFilter, onExpand, className = '' }: Props) {
  const { settings } = useSettings()
  const [showWhy, setShowWhy] = useState(false)
  const built = useMemo(
    () => buildChart(spec, ds, filters, { decimals: settings.decimals, compact: settings.compactNumbers, maxCategories: settings.maxCategories }),
    [spec, ds, filters, settings.decimals, settings.compactNumbers, settings.maxCategories],
  )
  const clickable = !!built.filterColumn

  return (
    <GlassPanel data-anim className={`p-4 flex flex-col min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="badge badge-cyan">{CHART_LABEL[spec.kind]}</span>
            {clickable && <span className="text-[0.65rem] text-dim hidden sm:inline">항목 클릭 → 필터</span>}
          </div>
          <h3 className="mt-1.5 font-semibold text-[0.95rem] truncate" title={spec.title}>
            {spec.title}
          </h3>
        </div>
        <div className="flex gap-1 shrink-0">
          <button className="btn btn-ghost btn-icon" onClick={() => setShowWhy((v) => !v)} aria-label="추천 이유와 집계 기준" aria-expanded={showWhy}>
            <Icon name="info" size={16} />
          </button>
          <button className="btn btn-ghost btn-icon" onClick={onExpand} aria-label="상세 분석 열기">
            <Icon name="expand" size={16} />
          </button>
        </div>
      </div>
      {showWhy && (
        <div className="mt-2 rounded-lg bg-deep/70 border border-cyan/10 p-2.5 text-[0.72rem] text-muted space-y-1">
          <div>
            <span className="badge badge-violet mr-1">규칙 기반 추천</span>
            {spec.reason}
          </div>
          {built.criteria.map((c) => (
            <div key={c}>· {c}</div>
          ))}
        </div>
      )}
      <div className="relative mt-2 flex-1 min-h-[250px]">
        {built.option ? (
          <EChart
            option={built.option}
            className="absolute inset-0"
            ariaLabel={`${spec.title} 차트`}
            onClick={
              clickable
                ? (e) => {
                    const row = built.table.find((r) => r.label === e.name)
                    if (row && row.key !== '__other__') onToggleFilter(built.filterColumn!.key, row.key)
                  }
                : undefined
            }
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted text-center px-6">
            <div>
              <Icon name="alert" className="mx-auto text-warn mb-2" />
              {built.empty}
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 text-[0.68rem] text-dim truncate" title={built.criteria.join(' / ')}>
        {built.criteria[1] ?? built.criteria[0]}
      </div>
      {built.notes.map((n) => (
        <div key={n} className="text-[0.68rem] text-warn/80">
          {n}
        </div>
      ))}
    </GlassPanel>
  )
}
