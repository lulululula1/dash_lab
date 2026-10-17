// 샘플 데이터 파일 생성: node scripts/generate-samples.mjs
// 데모 모드와 같은 생성기(src/engine/demo.ts)를 사용한다. (Node 22.18+ 타입 제거 기능 필요)
import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'
import { DEMO_NOTICE, demoDepartmentSheet, demoSheetRows } from '../src/engine/demo.ts'

const out = new URL('../public/samples/', import.meta.url)
const csvCell = (v) => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

const main = demoSheetRows()
writeFileSync(new URL('demo-education.csv', out), toCsv(main))

const wb = new ExcelJS.Workbook()
wb.creator = 'NEXUS DATA COMMAND (가상 데이터)'
const ws = wb.addWorksheet('교육실적')
ws.addRow([`[가상 데이터] ${DEMO_NOTICE}`])
ws.addRow([])
main.forEach((r, i) => {
  const row = ws.addRow(i === 0 ? r : r.map((v, c) => (c === 1 && v ? new Date(`${v}T00:00:00Z`) : v)))
  if (i === 0) row.font = { bold: true }
})
ws.getColumn(2).numFmt = 'yyyy-mm-dd'
ws.columns.forEach((c) => (c.width = 14))
const dept = wb.addWorksheet('부서정보')
demoDepartmentSheet().forEach((r) => dept.addRow(r))
await wb.xlsx.writeFile(new URL('demo-education.xlsx', out).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

// 오류 처리 확인용 '지저분한' 샘플: 제목 행, 결측, 잘못된 숫자·날짜, 0 값, 중복 행
const messy = [
  ['2024 지역별 행사 실적 (가상)'],
  [],
  ['행사일', '지역', '참가자수', '만족도', '비고'],
  ['2023-03-02', '서울', '1,250', '4.5', ''],
  ['2023-05-17', '부산', '0', '4.1', '우천 취소'],
  ['2023-02-30', '대구', '430', '-', '날짜 오류 예시'],
  ['2024.04.11', '서울', '1,410', '4.7', ''],
  ['2024년 6월 3일', '부산', '미집계', '3.9', '숫자 오류 예시'],
  ['2024-09-21', '광주', '', '4.0', '결측 예시'],
  ['2024-09-21', '광주', '', '4.0', '결측 예시'],
  ['2025-01-15', '대구', '520', '4.3', ''],
  ['2025-03-08', '서울', '1,380', '4.6', ''],
]
writeFileSync(new URL('messy-sample.csv', out), toCsv(messy))
console.log(`생성 완료: demo-education.csv (${main.length - 1}행), demo-education.xlsx, messy-sample.csv`)
