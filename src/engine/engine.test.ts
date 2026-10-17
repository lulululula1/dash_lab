import { describe, expect, it } from 'vitest'
import type { RawWorkbook } from '../types/data'
import { applyFilters, computeGrowth, groupBy, limitGroups, scatter } from './aggregate'
import { buildDataset, detectHeaderRow } from './dataset'
import { makeDemoWorkbook } from './demoWorkbook'
import { DataError } from './errors'
import { ruleInsights } from './insights'
import { decodeText, parseCsvText, parseFileBuffer, validateFileMeta } from './parse'
import { recommendCharts } from './recommend'

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer

function csvWorkbook(text: string): RawWorkbook {
  return { fileName: 't.csv', fileSize: text.length, format: 'csv', sheets: [parseCsvText(text, 't')], isDemo: false }
}

describe('파일 검증', () => {
  it('형식과 크기를 제한한다', () => {
    expect(() => validateFileMeta('a.xls', 10)).toThrow(DataError)
    expect(() => validateFileMeta('a.pdf', 10)).toThrow(/지원하지 않는/)
    expect(() => validateFileMeta('a.csv', 0)).toThrow(/빈 파일/)
    expect(() => validateFileMeta('a.csv', 21 * 1024 * 1024)).toThrow(/초과/)
    expect(() => validateFileMeta('A.XLSX', 100)).not.toThrow()
  })
  it('확장자와 실제 내용이 다르면 거부한다', async () => {
    await expect(parseFileBuffer(enc('a,b\n1,2'), 'x.xlsx')).rejects.toThrow(/올바른 XLSX/)
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]).buffer
    await expect(parseFileBuffer(zip, 'x.csv')).rejects.toThrow(/엑셀 파일/)
  })
})

describe('CSV 인코딩', () => {
  it('UTF-8 BOM을 제거한다', () => {
    const { text, encoding } = decodeText(enc('﻿부서,인원'))
    expect(encoding).toBe('utf-8')
    expect(text).toBe('부서,인원')
  })
  it('EUC-KR(CP949) CSV를 해석한다', () => {
    // "부서" in EUC-KR = BA CE BC AD
    const bytes = new Uint8Array([0xba, 0xce, 0xbc, 0xad, 0x2c, 0x31])
    const { text, encoding } = decodeText(bytes.buffer)
    expect(encoding).toBe('euc-kr')
    expect(text).toBe('부서,1')
  })
})

describe('데이터셋 구성', () => {
  it('보고서 제목 행을 건너뛰고 헤더를 찾는다', () => {
    const rows = [['2024 교육 실적 보고'], [], ['부서', '인원', '만족도'], ['A', 1, 2]]
    expect(detectHeaderRow(rows)).toBe(2)
  })

  it('결측과 0을 구분하고 잘못된 숫자를 보고한다', () => {
    const ds = buildDataset(csvWorkbook('부서,인원\nA,0\nA,\nB,10\nB,오류\nC,5\n'), 0)
    const people = ds.columns[1]
    expect(people.type).toBe('number')
    expect(people.missing).toBe(1)
    expect(people.invalid).toBe(1)
    expect(people.invalidRows).toEqual([5])
    expect(people.stats).toMatchObject({ count: 3, sum: 15, min: 0, zeroCount: 1 })
    expect(ds.quality.warnings.some((w) => w.message.includes('해석할 수 없는 값 1건'))).toBe(true)
  })

  it('중복 행과 빈 행을 탐지하고 중복 열 이름을 구분한다', () => {
    const ds = buildDataset(csvWorkbook('a,a,b\n1,2,x\n\n1,2,x\n3,4,y\n'), 0)
    expect(ds.columns.map((c) => c.name)).toEqual(['a', 'a (2)', 'b'])
    expect(ds.quality.duplicateRows).toBe(1)
    expect(ds.quality.duplicateRowNumbers).toEqual([4])
    expect(ds.quality.emptyRowsSkipped).toBe(1)
    expect(ds.rowNumbers).toEqual([2, 4, 5])
  })

  it('데이터 행이 없으면 오류를 낸다', () => {
    expect(() => buildDataset(csvWorkbook('a,b\n'), 0)).toThrow(/데이터 행이 없습니다/)
  })
})

describe('집계', () => {
  const ds = buildDataset(
    csvWorkbook(['연도,부서,인원,만족도', '2022,A,10,4', '2022,B,0,', '2023,A,15,5', '2023,B,5,3', '2024,A,,4', '2024,B,,', ',A,7,4'].join('\n')),
    0,
  )
  const [year, dept, people, sat] = ds.columns
  const all = applyFilters(ds, {})

  it('역할을 추론한다', () => {
    expect(year.role).toBe('year')
    expect(dept.role).toBe('dimension')
    expect(people.role).toBe('measure')
  })

  it('값이 모두 결측인 그룹은 0이 아니라 null이다', () => {
    const res = groupBy({ dimension: year, measure: people, agg: 'sum', indices: all })
    expect(res.rows.map((r) => [r.key, r.value])).toEqual([
      ['2022', 10],
      ['2023', 20],
      ['2024', null],
    ])
    expect(res.excludedMissingDimension).toBe(1)
    expect(res.excludedMissingMeasure).toBe(2)
  })

  it('평균은 유효 값만으로 계산한다', () => {
    const res = groupBy({ dimension: dept, measure: sat, agg: 'mean', indices: all })
    const b = res.rows.find((r) => r.key === 'B')!
    expect(b.value).toBe(3)
    expect(b.validCount).toBe(1)
    expect(b.rowCount).toBe(3)
  })

  it('증감률: 0 기준과 데이터 없음을 별도 처리한다', () => {
    const growth = computeGrowth(groupBy({ dimension: year, measure: people, agg: 'sum', indices: all }).rows)
    expect(growth[0].status).toBe('no-prev')
    expect(growth[1]).toMatchObject({ status: 'ok', growth: 1 })
    expect(growth[2].status).toBe('no-data')
    const zero = computeGrowth([
      { key: '2020', label: '2020', sortKey: 2020, value: 0, validCount: 1, rowCount: 1 },
      { key: '2021', label: '2021', sortKey: 2021, value: 5, validCount: 1, rowCount: 1 },
    ])
    expect(zero[1]).toMatchObject({ status: 'zero-base', growth: null })
    const gap = computeGrowth([
      { key: '2020', label: '2020', sortKey: 2020, value: 4, validCount: 1, rowCount: 1 },
      { key: '2022', label: '2022', sortKey: 2022, value: 5, validCount: 1, rowCount: 1 },
    ])
    expect(gap[1].status).toBe('no-prev')
  })

  it('필터는 열 간 AND, 값 간 OR로 적용된다', () => {
    expect(applyFilters(ds, { [dept.key]: ['A'] })).toEqual([0, 2, 4, 6])
    expect(applyFilters(ds, { [dept.key]: ['A'], [year.key]: ['2023', '2024'] })).toEqual([2, 4])
  })

  it('상위 N개 외에는 합계일 때만 기타로 묶는다', () => {
    const rows = [5, 4, 3, 2, 1].map((v, i) => ({ key: `k${i}`, label: `k${i}`, sortKey: `k${i}`, value: v, validCount: 1, rowCount: 1 }))
    const sum = limitGroups(rows, 3, 'sum')
    expect(sum.rows.at(-1)).toMatchObject({ key: '__other__', value: 3 })
    expect(limitGroups(rows, 3, 'mean').rows).toHaveLength(3)
  })

  it('상관계수를 계산한다', () => {
    const res = scatter(people, sat, all)
    expect(res.pairs).toBe(4)
    expect(res.correlation).not.toBeNull()
  })
})

describe('데모 모드', () => {
  const wb = makeDemoWorkbook()
  const ds = buildDataset(wb, 0)

  it('가상 데이터로 표시되고 같은 엔진으로 분석된다', () => {
    expect(ds.isDemo).toBe(true)
    expect(wb.sheets).toHaveLength(2)
    expect(ds.rowCount).toBeGreaterThan(100)
    const roles = Object.fromEntries(ds.columns.map((c) => [c.name, c.role]))
    expect(roles).toMatchObject({ 연도: 'year', 교육일자: 'time', 부서: 'dimension', 교육인원: 'measure', 만족도: 'measure' })
  })

  it('의도적으로 넣은 결측과 중복을 탐지한다', () => {
    const sat = ds.columns.find((c) => c.name === '만족도')!
    expect(sat.missing).toBe(3)
    expect(ds.quality.duplicateRows).toBe(1)
  })

  it('차트를 추천하고 규칙 기반 인사이트를 만든다', () => {
    const charts = recommendCharts(ds)
    expect(charts.length).toBeGreaterThanOrEqual(4)
    expect(charts[0]).toMatchObject({ kind: 'line', agg: 'sum' })
    expect(charts.find((c) => c.title.includes('만족도'))?.agg).toBe('mean')
    const insights = ruleInsights(ds, applyFilters(ds, {}))
    expect(insights.length).toBeGreaterThan(0)
    expect(insights.every((i) => i.source === 'rule')).toBe(true)
  })

  it('데모 생성은 재현 가능하다', () => {
    expect(buildDataset(makeDemoWorkbook(), 0).columns[6].stats?.sum).toBe(ds.columns[6].stats?.sum)
  })
})
