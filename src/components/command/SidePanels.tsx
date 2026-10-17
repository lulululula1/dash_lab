import { useMemo } from 'react'
import { ruleInsights } from '../../engine/insights'
import type { Dataset } from '../../types/data'
import { formatDate, formatNumber, formatShare } from '../../utils/format'
import { ROLE_LABEL, TYPE_LABEL } from '../labels'
import { GlassPanel, Icon } from '../ui'

export function QualityPanel({ ds }: { ds: Dataset }) {
  const q = ds.quality
  const completeness = q.totalCells > 0 ? 1 - (q.totalMissing + q.totalInvalid) / q.totalCells : 1
  const cols = ds.columns.filter((c) => c.role !== 'ignored')
  return (
    <GlassPanel data-anim className="p-4">
      <div className="flex items-center justify-between">
        <div className="panel-title">DATA INTEGRITY</div>
        <span className={`badge ${completeness >= 0.98 ? 'badge-ok' : completeness >= 0.9 ? 'badge-warn' : 'badge-bad'}`}>완전성 {formatShare(completeness)}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { label: '결측 셀', value: q.totalMissing },
          { label: '해석 오류', value: q.totalInvalid },
          { label: '중복 행', value: q.duplicateRows },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-deep/60 border border-cyan/10 py-2">
            <div className={`mono text-lg font-bold ${s.value > 0 ? 'text-warn' : 'text-ok'}`}>{s.value.toLocaleString('ko-KR')}</div>
            <div className="text-[0.68rem] text-muted">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-1.5">
        <div className="text-[0.7rem] text-muted">열별 결측률</div>
        {cols.map((c) => {
          const rate = c.missing / ds.rowCount
          return (
            <div key={c.key} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate text-muted" title={c.name}>
                {c.name}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-cyan/10 overflow-hidden">
                <div className={`h-full rounded-full ${rate === 0 ? 'bg-ok/60' : rate < 0.1 ? 'bg-warn' : 'bg-bad'}`} style={{ width: `${Math.max(rate * 100, rate > 0 ? 3 : 100)}%`, opacity: rate === 0 ? 0.35 : 1 }} />
              </div>
              <span className="w-12 text-right mono text-dim">{c.missing === 0 ? '0' : formatShare(rate)}</span>
            </div>
          )
        })}
      </div>
      {q.warnings.length > 0 && (
        <ul className="mt-4 space-y-1.5 max-h-48 overflow-y-auto scroll-thin pr-1">
          {q.warnings.map((w, i) => (
            <li key={i} className="flex gap-2 text-[0.72rem] leading-snug">
              <Icon name={w.level === 'info' ? 'info' : 'alert'} size={13} className={`shrink-0 mt-0.5 ${w.level === 'info' ? 'text-cyan' : w.level === 'warn' ? 'text-warn' : 'text-bad'}`} />
              <span className="text-muted">{w.message}</span>
            </li>
          ))}
        </ul>
      )}
      {q.duplicateRowNumbers.length > 0 && <p className="mt-2 text-[0.68rem] text-dim">중복 행 위치(원본 행 번호): {q.duplicateRowNumbers.join(', ')}</p>}
    </GlassPanel>
  )
}

export function InsightPanel({ ds, indices }: { ds: Dataset; indices: number[] }) {
  const insights = useMemo(() => ruleInsights(ds, indices), [ds, indices])
  const tone = { positive: 'text-ok', negative: 'text-bad', neutral: 'text-cyan', warning: 'text-warn' } as const
  return (
    <GlassPanel data-anim className="p-4">
      <div className="flex items-center justify-between">
        <div className="panel-title">INSIGHTS</div>
        <span className="badge badge-violet" title="AI가 아닌 사전 정의된 규칙과 실제 데이터 계산으로 생성">
          규칙 기반
        </span>
      </div>
      {insights.length === 0 ? (
        <p className="mt-3 text-sm text-muted">현재 조건에서 도출할 수 있는 인사이트가 없습니다.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {insights.map((ins) => (
            <li key={ins.id} className="flex gap-2.5">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-current ${tone[ins.level]}`} />
              <div className="min-w-0">
                <div className="text-sm leading-snug">{ins.title}</div>
                <div className="text-[0.72rem] text-dim mt-0.5">{ins.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 rounded-xl border border-dashed border-violet/30 p-3">
        <div className="flex items-center gap-2 text-sm">
          <Icon name="spark" size={15} className="text-violet" />
          <span className="font-medium">AI 분석</span>
          <span className="badge badge-warn">미구현 · 확장 예정</span>
        </div>
        <p className="mt-1.5 text-[0.72rem] text-dim leading-relaxed">
          현재 버전에는 AI 분석 기능이 없습니다. 위 인사이트는 모두 규칙 기반 계산 결과입니다. AI 분석은 서버 프록시와 사용자 동의 절차를 갖춘 뒤 별도 표시로 제공할 예정입니다.
        </p>
      </div>
    </GlassPanel>
  )
}

export function ColumnTable({ ds }: { ds: Dataset }) {
  return (
    <GlassPanel data-anim className="p-4">
      <div className="flex items-center justify-between">
        <div className="panel-title">SCHEMA · 열 구조</div>
        <span className="text-[0.7rem] text-dim">
          머리글: 원본 {ds.headerRow}행 · 열 {ds.columns.length}개
        </span>
      </div>
      <div className="mt-3 overflow-x-auto scroll-thin max-h-80">
        <table className="data-table">
          <thead>
            <tr>
              <th>열 이름</th>
              <th>유형</th>
              <th>역할</th>
              <th className="text-right">결측</th>
              <th className="text-right">오류</th>
              <th className="text-right">고유값</th>
              <th>요약</th>
            </tr>
          </thead>
          <tbody>
            {ds.columns.map((c) => (
              <tr key={c.key}>
                <td className="font-medium whitespace-nowrap">{c.name}</td>
                <td>
                  <span className="badge badge-cyan">{TYPE_LABEL[c.type]}</span>
                </td>
                <td>
                  <span className={`badge ${c.role === 'measure' ? 'badge-violet' : c.role === 'ignored' ? 'badge-warn' : 'badge-cyan'}`}>{ROLE_LABEL[c.role]}</span>
                </td>
                <td className={`text-right mono ${c.missing ? 'text-warn' : 'text-dim'}`}>{c.missing.toLocaleString('ko-KR')}</td>
                <td className={`text-right mono ${c.invalid ? 'text-bad' : 'text-dim'}`}>{c.invalid.toLocaleString('ko-KR')}</td>
                <td className="text-right mono text-muted">{c.distinct.toLocaleString('ko-KR')}</td>
                <td className="text-muted text-xs whitespace-nowrap">
                  {c.role === 'year' && c.stats
                    ? `${c.stats.min} ~ ${c.stats.max}`
                    : c.stats
                    ? `${formatNumber(c.stats.min)} ~ ${formatNumber(c.stats.max)} · 평균 ${formatNumber(c.stats.mean, { decimals: 2 })}`
                    : c.dateRange
                      ? `${formatDate(c.dateRange.min)} ~ ${formatDate(c.dateRange.max)}`
                      : c.topValues?.length
                        ? `최빈: ${c.topValues[0].value} (${c.topValues[0].count})`
                        : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  )
}
