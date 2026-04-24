# GonpunClaw PolicyMap

> 주소가 들어 있는 엑셀만 올리면 공개 정책 지도를 만들 수 있는 셀프서비스 맵 퍼블리셔

[![Live](https://img.shields.io/badge/live-Vercel-blue)](https://gonpunclaw-policymap.vercel.app)
[![Upload](https://img.shields.io/badge/start-upload-0ea5e9)](https://gonpunclaw-policymap.vercel.app/upload)
[![Guide](https://img.shields.io/badge/guide-KO-22c55e)](./docs/USER-GUIDE-KO.md)
[![Template](https://img.shields.io/badge/template-xlsx-f59e0b)](./docs/sample-upload-template.xlsx)

GonpunClaw PolicyMap은 주소가 들어 있는 시트를 업로드하면 카카오 / VWorld / Juso 지오코더
폴백 체인으로 좌표를 찾고, MapLibre + Supabase 백엔드로 공유 가능한 정책 지도를 생성하는
프로젝트입니다.

단순한 지도 뷰어가 아니라, 정책 데이터를 발행하고 검토하는 작업 흐름 전체를 다룹니다.

- 엑셀 업로드로 주소 목록을 지도 데이터로 변환
- 지오코딩과 마커 저장 자동 처리
- 공개 지도 링크와 관리 링크 즉시 발급
- 공개 지도에서 검색, 분류 필터, 값 범위 필터, 표 보기 지원
- 관리 토큰으로 제목, 설명, 컬럼 라벨, 공개 여부 수정
- 운영자 신고/감사 로그 확인

## 프론트 페이지

- 라이브 URL: https://gonpunclaw-policymap.vercel.app
- 업로드 페이지: https://gonpunclaw-policymap.vercel.app/upload
- 사용자 가이드: [`docs/USER-GUIDE-KO.md`](docs/USER-GUIDE-KO.md)
- 업로드 템플릿: [`docs/sample-upload-template.xlsx`](docs/sample-upload-template.xlsx)

처음 보는 사용자에게 보여줄 기본 진입점은 `/` 랜딩 페이지입니다. 랜딩 페이지는 제품 설명보다
실제 작업 진입을 우선하도록 구성되어 있으며, `/upload` 에서 XLSX 템플릿을 받아 바로 업로드를
시작할 수 있습니다.

### 주요 화면

- `/` — 정책 지도 발행 흐름, 지도 미리보기, 업로드/템플릿/가이드 진입점을 제공
- `/upload` — 지도 기본 정보, 컬럼 표시 이름, 엑셀 파일 선택을 한 화면에서 처리
- `/m/[slug]` — 공개 지도. 검색, 분류 필터, 값 범위 필터, 범례, 표 보기를 제공
- `/manage/[slug]` — 관리 토큰으로 지도 정보 수정, 공개 여부 변경, 삭제 수행

## 라우트 개요

- `/` — 랜딩 페이지
- `/upload` — 엑셀 업로드 폼 (실사용 기준 `.xlsx` 권장, `.csv`는 헤더/인코딩 이슈 가능)
- `/api/upload` — `POST` 멀티파트. 파싱 → 지오코딩 → `maps`/`markers` 삽입 → `{ slug, admin_token }` 반환
- `/m/[slug]` — 공개 지도 (검색, 분류 / 값 범위 필터, 범례, 표 보기, 클러스터링, 팝업)
- `/manage/[slug]` — 관리 토큰으로 지도 정보 수정 및 삭제 (제목, 설명, 컬럼 라벨, 공개 여부)
- `/api/maps/[slug]/update` — `POST` JSON. 관리 토큰 검증 후 허용된 필드만 수정 (슬러그와 마커는 변경 불가)
- `/api/maps/[slug]/delete` — `POST` JSON. 관리 토큰 검증 후 지도와 종속 데이터를 삭제
- `/api/maps/[slug]/report` — `POST` JSON (`{ reason }`). 공개된 지도를 대상으로 익명 신고를 접수. 신고자 IP는 해시하여 저장
- `/staff/audit` — 운영자 전용 감사 로그 뷰어 (`STAFF_DASHBOARD_TOKEN` 필요)
- `/staff/reports` — 운영자 전용 신고 관리 뷰 (상태 필터 / 건수 제한 / 개별 상태 변경)
- `/api/staff/reports/update` — `POST`. 스태프 세션 쿠키 필요. `{ id, status }` 로 신고 상태를 `pending / reviewed / dismissed / resolved` 중 하나로 전환. 실제 변경이 있을 때만 `report.update` 감사 로그를 남김

## 요구 사항

- Node.js 20.9 이상
- Supabase 프로젝트 (서비스 롤 키 필요)
- 카카오 / VWorld / Juso 중 최소 하나의 지오코더 키
- 업로드 파일은 `.xlsx` 권장 (`.csv`는 스프레드시트 저장 방식에 따라 헤더/인코딩 해석이 흔들릴 수 있음)

## 환경 변수 (`.env.local`)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# 지오코더 (사용하는 키만 채우면 됨)
KAKAO_REST_API_KEY=
VWORLD_API_KEY=
JUSO_API_KEY=
GEOCODER_PRIORITY=kakao,vworld,juso

# 관리 토큰 해시용 페퍼 (32바이트 권장)
# openssl rand -hex 32
ADMIN_TOKEN_PEPPER=

# 운영 대시보드 토큰 (선택)
STAFF_DASHBOARD_TOKEN=

# Sentry (선택)
SENTRY_DSN=
```

`SUPABASE_SERVICE_ROLE_KEY`는 절대 클라이언트에 노출하지 마세요. 모든 쓰기는 서버 라우트에서
수행합니다.

## 데이터베이스 마이그레이션

`supabase/migrations/` 안의 SQL을 순서대로 실행합니다.

| 파일 | 내용 |
| --- | --- |
| `0001_initial_schema.sql` | 기본 테이블 (maps, markers, geocode_cache, geocode_failures, audit_log, reports, deleted_slugs) |
| `0002_indexes.sql` | 정렬 / 검색 인덱스 |
| `0003_rls_policies.sql` | 익명 사용자가 게시된(`is_listed=true`) 지도와 그 마커만 읽도록 하는 RLS 정책. 신고는 anon에게 INSERT만 허용 |

Supabase CLI를 쓰는 경우:

```bash
supabase db push
```

또는 SQL 에디터에 파일 내용을 그대로 붙여 넣어도 됩니다. 서비스 롤 키는 RLS를 우회하므로
서버 라우트의 동작에는 영향이 없습니다.

## 배포 준비 문서

- `docs/DEPLOY-CHECKLIST.md` — 실서버 배포 전 확인 항목
- `docs/PRODUCTION-ENV.md` — production 환경변수 실제 입력 가이드
- `docs/VERCEL-ENV-QUICK.md` — Vercel 입력창용 초압축 env 표
- `docs/USER-GUIDE-KO.md` — 최종 사용자용 한국어 사용 안내
- `docs/sample-upload-template.xlsx` — 업로드 테스트용 샘플 엑셀
- `docs/sample-upload-template.csv` — 참고용 샘플 CSV

## 실배포 검증 메모

- 2026-04-24 기준 Vercel production 배포 후 실서버 업로드 검증 완료
- Kakao geocoder로 2건 주소 변환 성공, 공개 지도/관리 페이지 모두 정상 확인
- 같은 날 `.csv` 샘플은 `BAD_HEADER`로 실패했고, `.xlsx` 샘플은 정상 통과했으므로 현재 운영 가이드는 `.xlsx` 우선이 안전함

## 개발 / 빌드

```bash
npm install
npm run dev          # http://localhost:3000
npm run build
npm start
npm run lint
npm test             # 단위 테스트 (vitest, fork pool)
npm run test:e2e     # Playwright E2E
npx playwright test tests/e2e/ui-ux.spec.ts --reporter=line
npm run gen:template # public/template.xlsx 재생성
```

현재 UI/UX 회귀 테스트는 다음을 확인합니다.

- 랜딩 페이지 주요 CTA 노출 및 데스크톱/모바일 가로 overflow 방지
- 업로드 폼에서 파일 선택 전 제출 비활성화, 선택 후 파일명 표시와 제출 활성화
- 공개 지도 필터 로직에서 분류 없음/값 없음 데이터가 활성 필터에 맞게 제외되는지
- 필터 전체 해제 시 사용자에게 빈 상태 안내가 표시되는지
- 업로드 성공 화면에서 공개 지도, 관리 페이지, 관리 토큰 액션이 노출되는지

## 보안 메모

- 업로드는 IP 단위 시간당 3회까지로 제한됩니다 (`src/lib/rate-limit.ts`).
- 관리 토큰은 페퍼와 함께 HMAC-SHA256으로 해시되어 저장됩니다 (`src/lib/tokens.ts`).
- 업로드한 사용자만 받는 관리 토큰은 응답 화면에서 한 번만 노출됩니다.
- 관리 페이지에서 관리 토큰으로 지도 정보를 수정하거나, 슬러그 재입력 확인 후 영구 삭제할 수 있습니다.
- 수정 API는 IP 단위 10분당 5회로 제한됩니다 (`LIMITS.adminAttempt`).
- 게시 기본값은 `is_listed=true`이며, 추후 운영자 모더레이션 흐름을 추가할 수 있습니다.
- 지도 생성 / 수정 / 삭제, 그리고 실패한 관리 토큰 시도는 `audit_log` 테이블에 기록됩니다.
  IP는 `ADMIN_TOKEN_PEPPER`를 키로 한 HMAC-SHA256으로 해시되어 저장되며, 원본 IP는 저장하지
  않습니다. User-Agent가 있으면 함께 기록하고, `details`에는 슬러그, 삽입/실패 건수, 변경된
  필드, `is_listed` 플래그 전환 등 운영에 필요한 최소 정보만 남깁니다. 감사 로그 기록이
  실패해도 핵심 요청은 정상적으로 완료됩니다 (`src/lib/audit.ts`).

## 운영자용 감사 로그 뷰어

- 접속 경로: `/staff/audit`
- 인증: `.env`의 `STAFF_DASHBOARD_TOKEN` 값을 로그인 폼에 입력하면 8시간짜리 HttpOnly 세션
  쿠키가 발급됩니다. 쿠키에는 원본 토큰 대신 `HMAC(token, ADMIN_TOKEN_PEPPER)` 파생값만
  저장되므로 로그인 이후 렌더된 HTML에 토큰이 노출되지 않습니다 (`src/lib/staff-auth.ts`).
- 로그인 시도는 IP 단위 10분당 5회로 제한됩니다 (`LIMITS.adminAttempt`). 잘못된 토큰은
  `?err=auth`, 한도 초과는 `?err=rate`, 환경 변수 누락은 `?err=config` 로 표기됩니다.
- `STAFF_DASHBOARD_TOKEN` 또는 `ADMIN_TOKEN_PEPPER` 가 비어 있으면 뷰어는 설정 오류 안내만
  표시하고 로그인 폼을 숨깁니다.
- 뷰어에서는 `created_at / action / map_id / ip_hash / user_agent / details` 를 표 형태로
  보여주며, action 드롭다운과 최대 건수(기본 100, 최대 500) 필터를 지원합니다. 오른쪽 상단의
  로그아웃 버튼은 세션 쿠키를 즉시 만료시킵니다.

## 운영자용 신고 관리 뷰

- 접속 경로: `/staff/reports`
- 인증은 `/staff/audit` 와 동일한 스태프 세션 쿠키를 사용합니다. 로그인 폼은 성공 시
  해당 페이지로 되돌아옵니다 (`redirect_to` 는 `/staff/audit` 또는 `/staff/reports` 만 허용).
- 표에는 `created_at / status / map_id / reporter_ip_hash / reason` 를 보여주며, 상태
  필터와 최대 건수(기본 100, 최대 500) 필터를 지원합니다.
- 각 행마다 상태 선택 드롭다운과 `적용` 버튼으로 `pending → reviewed / dismissed / resolved`
  간 전환이 가능합니다. 상태가 실제로 바뀐 경우에만 `audit_log` 에 `report.update` 가 기록되며,
  `details` 에는 `report_id / status_before / status_after` 가 남습니다.
