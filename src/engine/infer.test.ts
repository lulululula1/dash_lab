import { describe, expect, it } from 'vitest'
import { inferRole, inferType, isMissing, parseDate, parseNumber } from './infer'

describe('isMissing', () => {
  it('빈 값과 결측 표기는 결측, 0은 결측이 아니다', () => {
    expect(isMissing(null)).toBe(true)
    expect(isMissing('  ')).toBe(true)
    expect(isMissing('-')).toBe(true)
    expect(isMissing('N/A')).toBe(true)
    expect(isMissing(0)).toBe(false)
    expect(isMissing('0')).toBe(false)
    expect(isMissing(false)).toBe(false)
  })
})

describe('parseNumber', () => {
  it('천 단위 쉼표·통화·퍼센트·회계식 음수를 해석한다', () => {
    expect(parseNumber('1,234')?.value).toBe(1234)
    expect(parseNumber('₩ 1,500')?.value).toBe(1500)
    expect(parseNumber('12.5%')).toEqual({ value: 12.5, percent: true })
    expect(parseNumber('(1,000)')?.value).toBe(-1000)
    expect(parseNumber('-3.2e2')?.value).toBe(-320)
    expect(parseNumber(0)?.value).toBe(0)
  })
  it('숫자가 아닌 값은 거부한다', () => {
    expect(parseNumber('12,34')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('1.2.3')).toBeNull()
    expect(parseNumber('#DIV/0!')).toBeNull()
    expect(parseNumber(Infinity)).toBeNull()
  })
})

describe('parseDate', () => {
  it('여러 국내 날짜 표기를 UTC로 해석한다', () => {
    expect(parseDate('2024-03-01')).toBe(Date.UTC(2024, 2, 1))
    expect(parseDate('2024.3.1')).toBe(Date.UTC(2024, 2, 1))
    expect(parseDate('2024년 3월 1일')).toBe(Date.UTC(2024, 2, 1))
    expect(parseDate('2024/03')).toBe(Date.UTC(2024, 2, 1))
    expect(parseDate('20240301')).toBe(Date.UTC(2024, 2, 1))
    expect(parseDate('2024-03-01 13:05')).toBe(Date.UTC(2024, 2, 1, 13, 5))
  })
  it('존재하지 않는 날짜는 거부한다', () => {
    expect(parseDate('2024-02-30')).toBeNull()
    expect(parseDate('2023-02-29')).toBeNull()
    expect(parseDate('2024-13-01')).toBeNull()
    expect(parseDate('2024-02-29')).toBe(Date.UTC(2024, 1, 29))
    expect(parseDate('내일')).toBeNull()
  })
})

describe('inferType / inferRole', () => {
  it('90% 이상 해석되는 유형을 선택한다', () => {
    const nums = Array.from({ length: 19 }, (_, i) => String(i))
    expect(inferType([...nums, 'x']).type).toBe('number')
    expect(inferType([...nums, 'x', 'y', 'z']).type).toBe('string')
    expect(inferType(['2024-01-01', '2024-02-30', null]).type).toBe('date')
    expect(inferType([null, '', '-']).type).toBe('empty')
  })
  it('열 이름과 값으로 역할을 정한다', () => {
    expect(inferRole({ name: '연도', type: 'number', numbers: [2021, 2022], distinct: 2, nonMissing: 2 })).toBe('year')
    expect(inferRole({ name: '인원', type: 'number', numbers: [2021, 2022], distinct: 2, nonMissing: 2 })).toBe('measure')
    expect(inferRole({ name: '사번 ID', type: 'number', numbers: [1, 2], distinct: 2, nonMissing: 2 })).toBe('identifier')
    expect(inferRole({ name: '부서', type: 'string', distinct: 6, nonMissing: 200 })).toBe('dimension')
    expect(inferRole({ name: '비고', type: 'string', distinct: 180, nonMissing: 200 })).toBe('text')
    expect(inferRole({ name: '비고', type: 'string', distinct: 3, nonMissing: 5 })).toBe('text')
  })
})
