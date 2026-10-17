import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyFilters } from './aggregate'
import { buildDataset } from './dataset'
import { parseFileBuffer } from './parse'
import { rankMeasures, recommendCharts } from './recommend'

const load = (name: string) => {
  const b = readFileSync(new URL(`../../public/samples/${name}`, import.meta.url))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

describe('배포용 샘플 파일', () => {
  it('demo-education.csv와 .xlsx가 같은 결과를 낸다', async () => {
    const csv = buildDataset(await parseFileBuffer(load('demo-education.csv'), 'demo-education.csv'), 0)
    const xwb = await parseFileBuffer(load('demo-education.xlsx'), 'demo-education.xlsx')
    expect(xwb.sheets.map((s) => s.name)).toEqual(['교육실적', '부서정보'])
    const xlsx = buildDataset(xwb, 0)
    expect(xlsx.headerRow).toBe(3)
    expect(xlsx.rowCount).toBe(csv.rowCount)
    const sum = (ds: typeof csv, name: string) => ds.columns.find((c) => c.name === name)?.stats?.sum
    expect(sum(xlsx, '교육인원')).toBe(sum(csv, '교육인원'))
    expect(xlsx.columns.find((c) => c.name === '교육일자')?.type).toBe('date')
    expect(recommendCharts(xlsx).length).toBe(recommendCharts(csv).length)
  })

  it('messy-sample.csv의 오류를 탐지하고 임의 값을 만들지 않는다', async () => {
    const ds = buildDataset(await parseFileBuffer(load('messy-sample.csv'), 'messy-sample.csv'), 0)
    const [date, , people, sat] = ds.columns
    expect(ds.headerRow).toBe(3)
    expect(date.type).toBe('date')
    expect(date.invalid).toBe(1)
    expect(people.type).toBe('number')
    expect(people.invalid).toBe(1)
    expect(people.missing).toBe(2)
    expect(people.stats?.zeroCount).toBe(1)
    expect(people.stats?.sum).toBe(1250 + 0 + 430 + 1410 + 520 + 1380)
    expect(sat.missing).toBe(1)
    expect(ds.quality.duplicateRows).toBe(1)
    expect(applyFilters(ds, {}).length).toBe(9)
    expect(rankMeasures(ds)[0].name).toBe('참가자수')
    expect(ds.columns[4].role).toBe('text')
    expect(recommendCharts(ds).find((c) => c.kind === 'bar')?.dimensionKey).toBe(ds.columns[1].key)
  })
})
