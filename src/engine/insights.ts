import type { Dataset, Insight } from '../types/data'
import { formatNumber, formatPercent, formatShare } from '../utils/format'
import { AGG_LABEL, computeGrowth, groupBy, scatter } from './aggregate'
import { defaultAgg, dimensionColumns, rankMeasures, timeColumns } from './recommend'

/**
 * 규칙 기반 인사이트. 모든 문장은 현재 필터가 적용된 실제 데이터로 계산한다.
 * AI가 생성한 문장이 아니며 source는 항상 'rule'이다.
 */
export function ruleInsights(ds: Dataset, indices: number[]): Insight[] {
  const out: Insight[] = []
  if (indices.length === 0) return out
  const measures = rankMeasures(ds)
  const primary = measures[0]
  const time = timeColumns(ds)[0]
  const dims = dimensionColumns(ds)

  if (primary && time) {
    const agg = defaultAgg(primary)
    const growth = computeGrowth(groupBy({ dimension: time, measure: primary, agg, indices }).rows)
    const last = growth[growth.length - 1]
    if (last) {
      if (last.status === 'ok' && last.growth !== null) {
        out.push({
          id: 'yoy',
          source: 'rule',
          level: last.growth >= 0 ? 'positive' : 'negative',
          title: `${last.key}년 ${primary.name} ${AGG_LABEL[agg]} 전년 대비 ${formatPercent(last.growth)}`,
          detail: `${formatNumber(last.prevValue)} → ${formatNumber(last.value)} (기준: '${time.name}' 열, 결측 제외)`,
        })
      } else if (last.status === 'zero-base') {
        out.push({
          id: 'yoy',
          source: 'rule',
          level: 'warning',
          title: `${last.key}년 증감률 산출 불가`,
          detail: '전년 값이 0이어서 증감률을 계산하지 않았습니다.',
        })
      }
    }
  }

  if (primary && dims[0]) {
    const agg = defaultAgg(primary)
    const res = groupBy({ dimension: dims[0], measure: primary, agg, indices })
    const top = res.rows[0]
    const bottom = res.rows.filter((r) => r.value !== null).at(-1)
    if (res.rows.length < 2) {
      // 범주가 하나뿐이면 비교 인사이트를 만들지 않는다.
    } else if (top && top.value !== null && agg === 'sum') {
      const total = res.rows.reduce((s, r) => s + (r.value ?? 0), 0)
      out.push({
        id: 'top-dim',
        source: 'rule',
        level: 'neutral',
        title: `${dims[0].name} 중 '${top.label}'의 ${primary.name}이 가장 많음`,
        detail: `${formatNumber(top.value)} · 전체의 ${formatShare(total > 0 ? top.value / total : null)} (${res.rows.length}개 범주 중 1위)`,
      })
    } else if (top && bottom && top !== bottom && top.value !== null && bottom.value !== null) {
      out.push({
        id: 'top-dim',
        source: 'rule',
        level: 'neutral',
        title: `${dims[0].name}별 ${primary.name} ${AGG_LABEL[agg]}: 최고 '${top.label}', 최저 '${bottom.label}'`,
        detail: `${formatNumber(top.value, { decimals: 2 })} vs ${formatNumber(bottom.value, { decimals: 2 })}`,
      })
    }
  }

  const rate = measures.find((m) => m !== primary && defaultAgg(m) === 'mean')
  const rateDim = dims[1] ?? dims[0]
  if (rate && rateDim) {
    const res = groupBy({ dimension: rateDim, measure: rate, agg: 'mean', indices })
    const valid = res.rows.filter((r) => r.value !== null)
    if (valid.length >= 2) {
      const hi = valid[0]
      const lo = valid[valid.length - 1]
      out.push({
        id: 'rate',
        source: 'rule',
        level: 'neutral',
        title: `${rate.name} 평균 최고 '${hi.label}' · 최저 '${lo.label}'`,
        detail: `${rateDim.name} 기준 ${formatNumber(hi.value, { decimals: 2 })} vs ${formatNumber(lo.value, { decimals: 2 })} (차이 ${formatNumber((hi.value ?? 0) - (lo.value ?? 0), { decimals: 2 })})`,
      })
    }
  }

  if (primary && measures.length > 1) {
    const second = rate ?? measures[1]
    const sc = scatter(primary, second, indices)
    if (sc.correlation !== null && Math.abs(sc.correlation) >= 0.5) {
      out.push({
        id: 'corr',
        source: 'rule',
        level: 'neutral',
        title: `${primary.name}와 ${second.name}의 ${sc.correlation > 0 ? '양' : '음'}의 상관 (r = ${sc.correlation.toFixed(2)})`,
        detail: `두 값이 모두 있는 ${sc.pairs.toLocaleString('ko-KR')}행 기준. 상관관계는 인과관계를 의미하지 않습니다.`,
      })
    }
  }

  const worst = [...ds.columns].filter((c) => c.role !== 'ignored').sort((a, b) => b.missing - a.missing)[0]
  if (worst && worst.missing > 0) {
    out.push({
      id: 'missing',
      source: 'rule',
      level: 'warning',
      title: `'${worst.name}' 열 결측 ${worst.missing.toLocaleString('ko-KR')}건`,
      detail: `전체 ${ds.rowCount.toLocaleString('ko-KR')}행 중 ${formatShare(worst.missing / ds.rowCount)} — 해당 열 집계에서 제외됩니다 (0으로 간주하지 않음).`,
    })
  }
  return out
}
