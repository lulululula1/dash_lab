import type { RawWorkbook } from '../types/data'
import { demoDepartmentSheet, demoSheetRows } from './demo'

/** 데모 데이터를 업로드 파일과 같은 원시 통합 문서 형태로 만든다. */
export function makeDemoWorkbook(): RawWorkbook {
  return {
    fileName: '[가상] 공공기관 교육 운영 실적',
    fileSize: 0,
    format: 'demo',
    isDemo: true,
    sheets: [
      { name: '교육실적', rows: demoSheetRows(), truncated: false },
      { name: '부서정보', rows: demoDepartmentSheet(), truncated: false },
    ],
  }
}
