# Deploy Checklist

`gonpunclaw-policymap`를 실서버에 올리기 전에 확인할 항목들입니다.

## 1. 코드 상태
- [ ] `npm install`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `main` 브랜치에 최신 변경사항 커밋
- [ ] 원격 `origin/main` 푸시 완료

## 2. Supabase 상태
- [ ] 대상 프로젝트: `pwpflvaaqcxbmpqfaxms`
- [ ] 마이그레이션 적용 확인
  - [ ] `0001_initial_schema.sql`
  - [ ] `0002_indexes.sql`
  - [ ] `0003_rls_policies.sql`
- [ ] `public` 테이블 확인
  - [ ] `maps`
  - [ ] `markers`
  - [ ] `geocode_failures`
  - [ ] `geocode_cache`
  - [ ] `audit_log`
  - [ ] `reports`
  - [ ] `deleted_slugs`
- [ ] RLS 정책 확인
  - [ ] listed map만 공개 조회 가능
  - [ ] listed map의 marker만 공개 조회 가능
  - [ ] `reports`는 anon insert 가능

## 3. 배포 환경 변수
아래 값을 배포 플랫폼에 모두 등록합니다.

### 필수
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `ADMIN_TOKEN_PEPPER`
- [ ] `STAFF_DASHBOARD_TOKEN`

### 지오코더, 최소 1개 이상
- [ ] `KAKAO_REST_API_KEY`
- [ ] `VWORLD_API_KEY`
- [ ] `JUSO_API_KEY`
- [ ] `GEOCODER_PRIORITY`

### 선택
- [ ] `SENTRY_DSN`

## 4. Vercel 배포 시 체크
- [ ] `vercel login`
- [ ] 프로젝트 연결 또는 신규 생성
- [ ] Production 환경 변수 등록
- [ ] 첫 배포 실행
- [ ] 배포 URL 확인
- [ ] 커스텀 도메인 붙일 경우 DNS 설정

## 5. 배포 후 기능 점검
### 공개 사용자 흐름
- [ ] `/` 랜딩 페이지 열림
- [ ] `/upload`에서 엑셀 업로드 가능
- [ ] 지도 생성 후 `/m/[slug]` 접근 가능
- [ ] 공개 지도에서 필터/범례/팝업 동작
- [ ] 공개 지도에서 신고 제출 가능

### 관리자 흐름
- [ ] 업로드 후 관리 토큰 발급 확인
- [ ] `/manage/[slug]`에서 수정 가능
- [ ] `/manage/[slug]`에서 삭제 가능
- [ ] `is_listed=false` 전환 시 공개 접근 차단

### 운영자 흐름
- [ ] `/staff/audit` 로그인 가능
- [ ] 감사로그 조회 가능
- [ ] `/staff/reports` 로그인 가능
- [ ] 신고 상태 변경 가능

## 6. 운영 체크
- [ ] `audit_log`에 `map.create`, `map.update`, `map.delete`, `report.create`, `report.update`, `admin.auth_fail` 기록 확인
- [ ] report 제출 rate limit 동작 확인
- [ ] admin/staff 로그인 rate limit 동작 확인
- [ ] 서비스 롤 키가 클라이언트로 노출되지 않는지 확인

## 7. 배포 보류 중 메모
- 현재 앱 기능 구현과 검증은 완료됨
- Vercel 로그인은 아직 하지 않음
- 배포 재개 시: 로그인 → env 등록 → 배포 → 실서버 QA 순서로 진행
