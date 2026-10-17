# GitHub · Vercel 배포 절차

> GitHub 저장소 생성과 실제 Vercel 배포는 **아직 진행하지 않았습니다** (사용자 승인 후 진행). 아래는 준비된 설정과 절차입니다.

## 준비된 설정

- `vercel.json`
  - 프레임워크 `vite`, 빌드 `npm run build`, 출력 `dist`, 설치 `npm ci`
  - 보안 헤더: CSP(`connect-src 'self'` — 업로드 데이터의 외부 전송을 브라우저가 차단), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`
  - `/assets/*` 1년 캐시 (파일명에 해시 포함)
- 환경 변수: **필요 없음** (API 키를 프런트엔드에 넣지 않음)
- 로컬 검증: `npm run build && npm run preview` → 같은 보안 헤더로 동작 확인 가능

## 1. GitHub 저장소 만들기

```bash
git add .
git commit -m "feat: NEXUS DATA COMMAND v0.1.0"
gh repo create nexus-data-command --private --source . --push
```

공개 저장소로 만들려면 `--private` 대신 `--public`.

## 2-A. Vercel 대시보드로 배포 (권장)

1. https://vercel.com/new 에서 GitHub 계정 연결
2. `nexus-data-command` 저장소 Import
3. Framework Preset: **Vite** (vercel.json에 지정되어 자동 인식), Root Directory: 저장소 루트
4. Environment Variables: 없음 → **Deploy**
5. 이후 `main` 브랜치에 push하면 자동으로 프로덕션 배포, PR마다 미리보기 URL 생성

## 2-B. Vercel CLI로 배포

```bash
npm i -g vercel
vercel login
vercel          # 미리보기 배포 (최초 1회 프로젝트 연결 질문)
vercel --prod   # 프로덕션 배포
```

## 3. 배포 후 확인 목록

- [ ] 웰컴 화면 표시, 콘솔 오류 없음
- [ ] 데모 모드 → 시트 선택 → 관제실 진입, "가상 데이터" 표시
- [ ] `/samples/demo-education.xlsx` 업로드 시 다중 시트 선택 동작
- [ ] 개발자 도구 Network 탭에서 업로드 중 외부 요청이 없는지 확인
- [ ] 응답 헤더에 `Content-Security-Policy` 포함 확인
- [ ] 모바일 폭(375px)에서 가로 스크롤 없음
