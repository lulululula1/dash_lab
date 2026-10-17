import { useMemo, useRef, useState } from 'react'
import { ChartCard } from '../components/command/ChartCard'
import { FilterBar } from '../components/command/FilterBar'
import { KpiRow } from '../components/command/KpiRow'
import { ColumnTable, InsightPanel, QualityPanel } from '../components/command/SidePanels'
import { Brand, Icon } from '../components/ui'
import { applyFilters } from '../engine/aggregate'
import { DEMO_NOTICE } from '../engine/demo'
import { rankMeasures, recommendCharts } from '../engine/recommend'
import { useStaggerIn } from '../hooks/useMotion'
import type { ChartSpec, Dataset, FilterState, RawWorkbook } from '../types/data'
import { DetailPanel } from './DetailPanel'

interface Props {
  ds: Dataset
  workbook: RawWorkbook
  sheetIndex: number
  onSwitchSheet: (index: number) => void
  onNewData: () => void
  onSettings: () => void
}

export function CommandCenter({ ds, workbook, sheetIndex, onSwitchSheet, onNewData, onSettings }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [filters, setFilters] = useState<FilterState>({})
  const [charts, setCharts] = useState<ChartSpec[]>(() => recommendCharts(ds))
  const [detailId, setDetailId] = useState<string | null>(null)
  const measures = useMemo(() => rankMeasures(ds), [ds])
  const [measureKey, setMeasureKey] = useState<string | undefined>(measures[0]?.key)
  const measure = measures.find((m) => m.key === measureKey)
  const indices = useMemo(() => applyFilters(ds, filters), [ds, filters])
  useStaggerIn(root, [ds.id])

  const toggleFilter = (colKey: string, value: string) => {
    setFilters((f) => {
      const cur = f[colKey] ?? []
      return { ...f, [colKey]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] }
    })
  }
  const detail = charts.find((c) => c.id === detailId)

  return (
    <div ref={root} className="relative z-10 min-h-screen">
      <header className="sticky top-0 z-30 border-b border-cyan/10 bg-void/70 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Brand compact />
          <div className="hidden md:block h-8 w-px bg-cyan/15" />
          <div className="min-w-0 flex-1 order-last md:order-none basis-full md:basis-auto">
            <div className="flex items-center gap-2 min-w-0">
              <span className="pulse-dot shrink-0" aria-hidden="true" />
              <span className="text-sm font-medium truncate" title={ds.sourceName}>
                {ds.sourceName}
              </span>
              {ds.isDemo && <span className="badge badge-warn shrink-0">가상 데이터</span>}
              <span className="badge badge-cyan shrink-0">{ds.format.toUpperCase()}</span>
            </div>
            <div className="text-[0.7rem] text-dim mt-0.5 mono">
              {ds.rowCount.toLocaleString('ko-KR')}행 · {ds.columns.length}열 · 시트 '{ds.sheetName}' · 브라우저 로컬 분석
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {workbook.sheets.length > 1 && (
              <select className="select text-xs! py-1.5!" value={sheetIndex} onChange={(e) => onSwitchSheet(Number(e.target.value))} aria-label="시트 전환">
                {workbook.sheets.map((s, i) => (
                  <option key={s.name + i} value={i}>
                    시트: {s.name}
                  </option>
                ))}
              </select>
            )}
            <button className="btn btn-ghost text-xs py-1.5!" onClick={onNewData}>
              <Icon name="upload" size={14} />
              <span className="hidden sm:inline">새 데이터</span>
            </button>
            <button className="btn btn-ghost btn-icon" onClick={onSettings} aria-label="설정">
              <Icon name="settings" size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5 space-y-5">
        {ds.isDemo && (
          <div data-anim className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-2.5 text-xs text-warn flex gap-2 items-start">
            <Icon name="info" size={14} className="shrink-0 mt-0.5" />
            {DEMO_NOTICE}
          </div>
        )}
        <div data-anim>
          <FilterBar ds={ds} filters={filters} onChange={setFilters} />
        </div>
        <KpiRow ds={ds} indices={indices} measure={measure} measures={measures} onMeasure={setMeasureKey} />

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] 2xl:grid-cols-[1fr_380px] gap-5">
          <section aria-label="자동 생성 차트" className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-[minmax(360px,auto)]">
            {charts.length === 0 && (
              <div className="glass p-8 text-center text-muted md:col-span-2">이 데이터에서는 자동으로 추천할 차트를 찾지 못했습니다. 열 구조를 확인해 주세요.</div>
            )}
            {charts.map((spec, i) => (
              <ChartCard
                key={spec.id}
                spec={spec}
                ds={ds}
                filters={filters}
                onToggleFilter={toggleFilter}
                onExpand={() => setDetailId(spec.id)}
                className={i === 0 && spec.kind === 'line' ? 'md:col-span-2' : ''}
              />
            ))}
          </section>
          <aside className="space-y-5 min-w-0">
            <InsightPanel ds={ds} indices={indices} />
            <QualityPanel ds={ds} />
          </aside>
        </div>
        <ColumnTable ds={ds} />
        <p className="text-center text-[0.68rem] text-dim pb-4">
          모든 통계는 업로드한 데이터에서 직접 계산되며, 결측치는 0으로 간주하지 않고 집계에서 제외합니다. 데이터는 이 브라우저 밖으로 전송되지 않습니다.
        </p>
      </main>

      {detail && (
        <DetailPanel
          spec={detail}
          ds={ds}
          filters={filters}
          onToggleFilter={toggleFilter}
          onApply={(s) => setCharts((cs) => cs.map((c) => (c.id === s.id ? s : c)))}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}
