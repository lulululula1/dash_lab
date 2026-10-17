import { useEffect, useMemo, useRef, useState } from 'react'
import { allIndices, groupBy, isGroupable } from '../../engine/aggregate'
import type { Column, Dataset, FilterState } from '../../types/data'
import { Icon } from '../ui'

interface Props {
  ds: Dataset
  filters: FilterState
  onChange: (f: FilterState) => void
}

const MAX_FILTER_VALUES = 50

/** 필터 가능한 열: 범주·연도·날짜(연 단위) */
function filterableColumns(ds: Dataset): Column[] {
  return ds.columns.filter((c) => isGroupable(c) && c.distinct >= 2)
}

function FilterMenu({ ds, col, selected, onChange }: { ds: Dataset; col: Column; selected: string[]; onChange: (vals: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const options = useMemo(() => {
    const res = groupBy({ dimension: col, measure: null, agg: 'count', indices: allIndices(ds) })
    return res.rows.slice(0, MAX_FILTER_VALUES)
  }, [ds, col])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const toggle = (k: string) => onChange(selected.includes(k) ? selected.filter((v) => v !== k) : [...selected, k])

  return (
    <div ref={ref} className="relative">
      <button className="chip" aria-pressed={selected.length > 0} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {col.name}
        {col.type === 'date' && <span className="opacity-70">(연)</span>}
        {selected.length > 0 && <span className="font-bold">· {selected.length}</span>}
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" stroke="currentColor" fill="none" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-40 mt-2 w-64 max-w-[80vw] glass p-2 shadow-2xl" role="menu">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs text-muted">{col.name} 값 선택</span>
            {selected.length > 0 && (
              <button className="text-xs text-cyan hover:underline" onClick={() => onChange([])}>
                해제
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto scroll-thin">
            {options.map((o) => (
              <label key={o.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-cyan/5 cursor-pointer text-sm">
                <input type="checkbox" className="accent-cyan-400" checked={selected.includes(o.key)} onChange={() => toggle(o.key)} />
                <span className="flex-1 truncate">{o.label}</span>
                <span className="text-xs text-dim mono">{o.rowCount.toLocaleString('ko-KR')}</span>
              </label>
            ))}
          </div>
          {col.distinct > MAX_FILTER_VALUES && <p className="px-2 pt-2 text-[0.7rem] text-dim">건수 상위 {MAX_FILTER_VALUES}개 값만 표시합니다.</p>}
        </div>
      )}
    </div>
  )
}

export function FilterBar({ ds, filters, onChange }: Props) {
  const cols = filterableColumns(ds)
  const active = Object.entries(filters).filter(([, v]) => v.length > 0)
  if (cols.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs text-muted mr-1">
        <Icon name="filter" size={14} className="text-cyan" />
        필터
      </span>
      {cols.map((c) => (
        <FilterMenu key={c.key} ds={ds} col={c} selected={filters[c.key] ?? []} onChange={(vals) => onChange({ ...filters, [c.key]: vals })} />
      ))}
      {active.length > 0 && (
        <button className="chip text-bad! border-bad/30!" onClick={() => onChange({})}>
          <Icon name="reset" size={12} />
          전체 해제
        </button>
      )}
      {active.length > 0 && (
        <div className="w-full flex flex-wrap gap-1.5 mt-1">
          {active.flatMap(([key, vals]) => {
            const col = ds.columns.find((c) => c.key === key)
            return vals.map((v) => (
              <button
                key={key + v}
                className="badge badge-cyan cursor-pointer hover:brightness-125"
                onClick={() => onChange({ ...filters, [key]: vals.filter((x) => x !== v) })}
                aria-label={`${col?.name} ${v} 필터 제거`}
              >
                {col?.name}: {v}
                <Icon name="close" size={10} />
              </button>
            ))
          })}
        </div>
      )}
    </div>
  )
}
