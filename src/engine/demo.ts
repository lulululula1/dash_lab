/**
 * 데모 모드용 가상 데이터 — 공공기관 교육 운영 실적 (실제 기관·실적과 무관)
 * 다른 모듈을 import하지 않아 Node 스크립트(샘플 파일 생성)에서도 그대로 사용할 수 있다.
 * 실제 업로드와 같은 분석 엔진을 거치도록 '원시 시트' 형태로 만든다.
 */

type DemoCell = string | number | null

export const DEMO_NOTICE = '이 데이터는 시연을 위해 생성한 가상 데이터이며 실제 기관의 실적이 아닙니다.'

export const DEMO_HEADER = [
  '연도',
  '교육일자',
  '부서',
  '교육과정',
  '교육방식',
  '교육시간',
  '교육인원',
  '수료인원',
  '만족도',
  '예산(천원)',
] as const

const DEPARTMENTS = ['기획조정실', '디지털정책과', '인사혁신과', '재난안전과', '복지정책과', '감사담당관']
const COURSES: { name: string; hours: number; base: number; mode: string }[] = [
  { name: 'AI 활용 실무', hours: 16, base: 34, mode: '혼합' },
  { name: '공공데이터 분석', hours: 24, base: 26, mode: '집합' },
  { name: '디지털 리터러시', hours: 8, base: 48, mode: '온라인' },
  { name: '청렴·윤리 교육', hours: 4, base: 62, mode: '온라인' },
  { name: '리더십 역량 과정', hours: 21, base: 18, mode: '집합' },
  { name: '민원 응대 실무', hours: 8, base: 30, mode: '혼합' },
  { name: '재난 대응 훈련', hours: 12, base: 22, mode: '집합' },
]
const YEARS = [2021, 2022, 2023, 2024, 2025]

/** 재현 가능한 의사난수 (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 연도·부서·과정 조합별 운영 실적 행을 만든다.
 * 품질 검사 시연을 위해 결측치 몇 건과 중복 행 1건을 의도적으로 포함한다.
 */
export function generateDemoRows(seed = 20251017): DemoCell[][] {
  const r = rng(seed)
  const rows: DemoCell[][] = []
  YEARS.forEach((year, yi) => {
    // 연도별 추세: 디지털·AI 과정은 증가, 집합교육은 2021년(감염병 영향 가정) 저조
    for (const dept of DEPARTMENTS) {
      for (const course of COURSES) {
        if (r() < 0.28) continue // 모든 부서가 모든 과정을 운영하지는 않음
        const digitalBoost = course.name.includes('AI') || course.name.includes('데이터') ? 1 + yi * 0.22 : 1 + yi * 0.04
        const covidDip = course.mode === '집합' && year === 2021 ? 0.55 : 1
        const deptScale = 0.75 + DEPARTMENTS.indexOf(dept) * 0.08
        const trainees = Math.max(4, Math.round(course.base * digitalBoost * covidDip * deptScale * (0.8 + r() * 0.45)))
        const completion = Math.min(1, 0.78 + r() * 0.2 + (course.mode === '온라인' ? -0.06 : 0))
        const completed = Math.round(trainees * completion)
        const satisfaction = Math.round(Math.min(5, 3.6 + r() * 1.1 + (course.mode === '혼합' ? 0.15 : 0) + yi * 0.03) * 100) / 100
        const budget = Math.round((trainees * course.hours * (course.mode === '온라인' ? 9 : 21) * (0.9 + r() * 0.25)) / 10) * 10
        const month = 1 + Math.floor(r() * 11)
        const day = 1 + Math.floor(r() * 27)
        rows.push([
          year,
          `${year}-${pad(month)}-${pad(day)}`,
          dept,
          course.name,
          course.mode,
          course.hours,
          trainees,
          completed,
          satisfaction,
          budget,
        ])
      }
    }
  })
  rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])))
  // 품질 검사 시연용: 만족도 미조사 3건, 예산 미입력 2건, 중복 입력 1건
  const satCol = DEMO_HEADER.indexOf('만족도')
  const budgetCol = DEMO_HEADER.indexOf('예산(천원)')
  for (const i of [7, 41, 96]) if (rows[i]) rows[i][satCol] = null
  for (const i of [15, 120]) if (rows[i]) rows[i][budgetCol] = null
  if (rows[30]) rows.splice(31, 0, [...rows[30]])
  return rows
}

export function demoSheetRows(seed?: number): DemoCell[][] {
  return [[...DEMO_HEADER], ...generateDemoRows(seed)]
}

/** 다중 시트 시연용 부서 정보 시트 */
export function demoDepartmentSheet(): DemoCell[][] {
  return [
    ['부서', '정원', '소속'],
    ['기획조정실', 42, '본부'],
    ['디지털정책과', 28, '본부'],
    ['인사혁신과', 24, '본부'],
    ['재난안전과', 36, '현장'],
    ['복지정책과', 31, '현장'],
    ['감사담당관', 15, '본부'],
  ]
}
