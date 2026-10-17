import type { AggFn, ChartSpec, Column, Dataset } from '../types/data'
import { AGG_LABEL } from './aggregate'

/** 대표 수치로 쓰기 좋은 이름 (앞쪽일수록 우선) */
const VOLUME_KEYWORDS = ['인원', '매출', '금액', '수량', '건수', '횟수', '예산', '비용', '수입', '지출', 'sales', 'revenue', 'amount', 'count', 'qty', 'total', 'cost', '시간']
const RATE_NAME_RE = /(만족도|평점|점수|률|율|비율|평균|지수|score|rate|ratio|avg|average|index|%)/i

/** 비율·점수형 수치는 합계가 의미 없으므로 평균을 기본 집계로 쓴다. */
export function defaultAgg(measure: Column | undefined | null): AggFn {
  if (!measure) return 'count'
  if (measure.hasPercent || RATE_NAME_RE.test(measure.name)) return 'mean'
  return 'sum'
}

export function rankMeasures(ds: Dataset): Column[] {
  const ms = ds.columns.filter((c) => c.role === 'measure' && c.stats)
  const score = (c: Column) => {
    const name = c.name.toLowerCase()
    const v = VOLUME_KEYWORDS.findIndex((k) => name.includes(k))
    if (v >= 0) return v
    if (RATE_NAME_RE.test(c.name)) return 100
    // '참가자수', '판매량', '지원액'처럼 개수·양을 뜻하는 접미사
    if (/(수|명|량|액)$/.test(c.name.trim())) return 50
    return 200
  }
  return [...ms].sort((a, b) => score(a) - score(b) || a.index - b.index)
}

export function timeColumns(ds: Dataset): Column[] {
  return ds.columns
    .filter((c) => (c.role === 'year' || c.role === 'time') && c.distinct >= 2)
    .sort((a, b) => (a.role === b.role ? a.index - b.index : a.role === 'year' ? -1 : 1))
}

export function dimensionColumns(ds: Dataset): Column[] {
  return ds.columns.filter((c) => c.role === 'dimension' && c.distinct >= 2).sort((a, b) => a.distinct - b.distinct || a.index - b.index)
}

function title(dim: Column | undefined, measure: Column | null | undefined, agg: AggFn, suffix = ''): string {
  const m = agg === 'count' || !measure ? '건수' : `${measure.name} ${AGG_LABEL[agg]}`
  return dim ? `${dim.name}별 ${m}${suffix}` : `${m}${suffix}`
}

/** 데이터 구조에 맞는 차트를 규칙 기반으로 추천한다 (최대 6개). */
export function recommendCharts(ds: Dataset): ChartSpec[] {
  const measures = rankMeasures(ds)
  const times = timeColumns(ds)
  const dims = dimensionColumns(ds)
  const primary = measures[0]
  const time = times[0]
  const specs: ChartSpec[] = []
  let seq = 0
  const id = () => `chart-${++seq}`

  if (primary) {
    const agg = defaultAgg(primary)
    if (time) {
      specs.push({
        id: id(),
        kind: 'line',
        title: title(time, primary, agg, ' 추이'),
        dimensionKey: time.key,
        measureKey: primary.key,
        agg,
        timeGrain: 'year',
        reason: `시간 열 '${time.name}'과 수치 열 '${primary.name}'이 있어 연도별 변화를 선 차트로 표시합니다.`,
      })
    }
    // 막대는 범주가 많은 열(최대 20개), 도넛은 범주가 적은 열을 우선한다.
    const dim = [...dims].reverse().find((d) => d.distinct <= 20) ?? dims[0]
    if (dim) {
      specs.push({
        id: id(),
        kind: 'bar',
        title: title(dim, primary, agg),
        dimensionKey: dim.key,
        measureKey: primary.key,
        agg,
        reason: `범주 열 '${dim.name}'(${dim.distinct}개 값)별로 '${primary.name}'을 비교하기 위해 막대 차트를 사용합니다.`,
      })
    }
    const pieDim = dims.find((d) => d.distinct <= 6 && d !== dim)
    if (pieDim && agg === 'sum' && (primary.stats?.min ?? -1) >= 0) {
      specs.push({
        id: id(),
        kind: 'pie',
        title: title(pieDim, primary, agg, ' 구성비'),
        dimensionKey: pieDim.key,
        measureKey: primary.key,
        agg,
        reason: `'${pieDim.name}'의 범주가 ${pieDim.distinct}개로 적고 값이 모두 0 이상이라 전체 대비 비중을 도넛 차트로 표시합니다.`,
      })
    }
    const rate = measures.find((m) => m !== primary && defaultAgg(m) === 'mean')
    const rateDim = dims.find((d) => d !== dim) ?? dim
    if (rate && rateDim) {
      specs.push({
        id: id(),
        kind: 'bar',
        title: title(rateDim, rate, 'mean'),
        dimensionKey: rateDim.key,
        measureKey: rate.key,
        agg: 'mean',
        reason: `'${rate.name}'은 비율·점수형 수치로 판단되어 합계 대신 평균으로 비교합니다.`,
      })
    }
    const stackDim = dims.find((d) => d.distinct <= 8)
    if (time && stackDim && agg === 'sum') {
      specs.push({
        id: id(),
        kind: 'stackedBar',
        title: `${time.name}·${stackDim.name}별 ${primary.name} ${AGG_LABEL[agg]}`,
        dimensionKey: time.key,
        seriesKey: stackDim.key,
        measureKey: primary.key,
        agg,
        timeGrain: 'year',
        reason: `시간 흐름과 '${stackDim.name}' 구성 변화를 함께 보기 위해 누적 막대 차트를 사용합니다.`,
      })
    }
    const second = rate ?? measures[1]
    if (second && specs.length < 6) {
      specs.push({
        id: id(),
        kind: 'scatter',
        title: `${primary.name} × ${second.name} 관계`,
        xMeasureKey: primary.key,
        measureKey: second.key,
        agg: 'sum',
        reason: '수치 열이 2개 이상 있어 두 값의 관계를 산점도와 상관계수로 확인합니다.',
      })
    }
    if (specs.length < 6) {
      specs.push({
        id: id(),
        kind: 'histogram',
        title: `${primary.name} 분포`,
        measureKey: primary.key,
        agg: 'count',
        reason: `'${primary.name}' 값이 어느 구간에 몰려 있는지 히스토그램으로 확인합니다.`,
      })
    }
  } else {
    if (time) {
      specs.push({
        id: id(),
        kind: 'line',
        title: title(time, null, 'count', ' 추이'),
        dimensionKey: time.key,
        agg: 'count',
        timeGrain: 'year',
        reason: '수치 열이 없어 시간별 행 수(건수)를 표시합니다.',
      })
    }
    for (const dim of dims.slice(0, 3)) {
      specs.push({
        id: id(),
        kind: dim.distinct <= 6 ? 'pie' : 'bar',
        title: title(dim, null, 'count'),
        dimensionKey: dim.key,
        agg: 'count',
        reason: `수치 열이 없어 '${dim.name}' 범주별 행 수(건수)를 집계합니다.`,
      })
    }
  }
  return specs.slice(0, 6)
}
