# 공픈클로 폴리시맵 (Gonpunclaw Policymap) — 설계 문서

- **Date:** 2026-04-22
- **Status:** Draft (사용자 리뷰 대기)
- **Repo (예정):** `hosungseo/gonpunclaw-policymap`
- **배경:** 기존 `k-policymap` (peer comparison workspace)을 전면 재설계, 새 방향은 "이슈 기반 주소 시각화 플랫폼".

---

## 1. 목적 및 대상 사용자

### 1.1 한 줄 정의
> 주소 리스트만 있으면 바로 공개 지도가 되는 웹 도구. 중앙부처 사무관의 이슈 대응용.

### 1.2 해결하는 문제
중앙부처 사무관은 지자체를 통해 주소가 포함된 엑셀을 쉽게 받는다. 하지만 이를 지도로 시각화하는 도구가 없어 보고서나 대국민 설명에 쓰기 어렵다. 코로나맵·두쪽이맵처럼 이슈가 생길 때마다 누군가가 지도를 다시 만들어야 하는 비효율을 제거한다.

### 1.3 사용자
- **1차:** 중앙부처 사무관 (엑셀 숙련, 바이브코딩·GitHub·터미널 사용 불가 전제)
- **2차:** 지도 공유 링크를 열어보는 일반 국민/동료 공무원

### 1.4 성공 기준 (MVP)
- 사무관이 "엑셀 템플릿 내려받기 → 데이터 붙여넣기 → 업로드 → 공유 URL 획득"까지 5분 이내 완료
- 중규모(1,000~3,000행) 파일 지오코딩 성공률 ≥ 95%
- 공개 링크를 모바일에서 열었을 때 지도 렌더 ≤ 3초

---

## 2. 범위 정의

### 2.1 MVP 포함 (안 B — 표준)
- 엑셀 템플릿 기반 업로드 (고정 헤더: `주소*, 이름, 값, 분류, ...`)
- 지오코딩: Kakao Local → VWorld → Juso.go.kr 폴백 체인
- MapLibre GL JS + OSM 타일 + 마커
- 분류별 색상, 값에 따른 마커 크기, 마커 클러스터링
- 공유 URL + 관리 URL 이중 발급
- 관리 URL로 제목/설명 수정, 데이터 재업로드, 공개/비공개 토글, 삭제
- 지오코딩 실패 행 CSV 다운로드
- 하이브리드 디스커버리 (공개 갤러리 노출은 옵션 체크박스)
- OG 이미지 (@vercel/og)

### 2.2 MVP 제외 (추후 과제)
- 타임라인/버전 히스토리
- choropleth 집계 오버레이
- 히트맵
- iframe 임베드
- 필터 상태 URL 공유
- 다국어
- 태그/카테고리 계층
- 관리 URL 분실 복구 (원천적으로 불가, 이메일 1회 발송만 제공)

### 2.3 비목표
- 사내 분석 워크스페이스 (무인증 공개 지향)
- 개인정보(PII) 처리 (민감자료 없음 전제, 규정상 아키텍처적 대응 불요)

---

## 3. 핵심 결정 요약

| 항목 | 결정 | 근거 |
|------|------|------|
| 공개 범위 | 공개형 (누구나 열람) | 이슈 대응·대국민 공유 |
| 생성 주체 | 플랫폼형 셀프 서비스 | 사무관이 직접 올리고 바로 게시 |
| 데이터 민감도 | 민감자료 없음 (시설/업소 주소) | 익명화 불요, 아키텍처 단순 |
| 입력 형식 | 엑셀 템플릿(`.xlsx`) | 공직자 문화(양식 기반) 적합 |
| 컬럼 매핑 | 고정 스키마(`A:주소, B:이름, C:값, D:분류, E+:extra`) | 매핑 UI 생략, 단순 |
| 값·분류 | 모두 지원 (마커 크기/색) | 엑셀 컬럼 선택 없이 고정 규칙 |
| 인증 | 무인증 + 관리 URL 토큰 | 진입장벽 제거, 토큰으로 소유권 |
| 발견 | 하이브리드 (갤러리 노출 옵션) | 공유 저장소 + 도구 겸용 |
| 갱신 모델 | 스냅샷 (관리 URL로 데이터 교체) | 단순성, 타임라인은 추후 |
| 규모 | 수천 건/지도 (최대 10,000행) | 클러스터링만으로 충분 |
| 호스팅 | Vercel + Supabase | 무료 티어 충분, Next.js 궁합 |
| 지도 | MapLibre GL JS + OSM 타일 | WebGL 성능, 무료, 사실상 표준 |
| 지오코딩 | Kakao → VWorld → Juso 폴백 | 장애 탄성 + 품질 |
| repo 이름 | `gonpunclaw-policymap` | 공픈클로 브랜드 |

---

## 4. 아키텍처

### 4.1 스택
- **프런트:** Next.js 16 (App Router), TypeScript, Tailwind v4
- **백엔드:** Next.js API Routes (서버리스)
- **DB:** Supabase Postgres
- **Storage:** Supabase Storage (원본 엑셀 보관)
- **지도:** MapLibre GL JS
- **엑셀 파싱:** SheetJS (`xlsx`) 클라이언트 측
- **지오코딩:** 서버 측 공급자 체인(Kakao, VWorld, Juso)
- **모니터링:** Vercel 기본 + Sentry 무료

### 4.2 요청 플로우
```
사무관 브라우저
     ├─ [지도 생성] ─→ Next.js /api/maps
     │                    ├─→ SheetJS로 파싱된 행 수신
     │                    ├─→ Supabase Storage (원본 엑셀)
     │                    ├─→ Geocoding Chain (Kakao→VWorld→Juso)
     │                    │    └─→ geocode_cache 조회·저장
     │                    ├─→ Postgres: maps + markers + failures
     │                    └─→ SSE로 진행률 스트리밍
     │                                ↓
     │                    { slug, admin_token } 응답
     │
     └─ [지도 조회] ─→ Next.js SSR /m/{slug}
                          ├─→ Postgres: maps + markers JSON
                          └─→ 클라이언트가 MapLibre로 렌더
```

### 4.3 보안 경계
- 클라이언트는 Supabase 직접 접근 금지. 모든 DB·Storage 접근은 Next.js API 경유.
- 서버만 `service_role` 키 보유. 환경변수 저장.
- `admin_token`은 32자 URL-safe 랜덤 문자열. DB에는 `SHA-256(HMAC, 서버 pepper)` 해시만 저장. 요청 시 서버가 동일 해시로 비교.
- 쓰기 API는 `admin_token` 검증 미들웨어 필수.
- Rate limit: 업로드 1시간 3건/IP, 관리 토큰 시도 10분 5회/IP.

### 4.4 환경변수 (`.env.example`)
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Geocoders (모두 선택, 없으면 체인에서 제외)
KAKAO_REST_API_KEY=
VWORLD_API_KEY=
JUSO_API_KEY=
GEOCODER_PRIORITY=kakao,vworld,juso

# 관리자 대시보드 (선택)
ADMIN_DASHBOARD_TOKEN=

# Sentry
SENTRY_DSN=
```

---

## 5. 데이터 모델

### 5.1 테이블

**`maps`**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| slug | text unique | 공개 URL용 8자 랜덤 |
| admin_token_hash | text | SHA-256(HMAC, 서버 pepper) 해시. 평문은 URL에만 존재 |
| title | text | |
| description | text | |
| value_label | text | 엑셀 C열의 원본 헤더명 |
| value_unit | text | "원", "건" 등 사용자 지정(선택) |
| category_label | text | 엑셀 D열의 원본 헤더명 |
| is_listed | boolean default false | 공개 갤러리 노출 |
| source_file | text | Storage 경로 |
| geocoder_stats | jsonb | `{"kakao": 1200, "vworld": 40, "failed": 7}` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**`markers`**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| map_id | uuid FK → maps | CASCADE |
| row_index | int | 엑셀 원본 행 (1-기반) |
| address_raw | text | 원본 |
| address_normalized | text | 지오코더 표준화 |
| lat | double | |
| lng | double | |
| name | text | B열 |
| value | numeric nullable | C열 |
| category | text nullable | D열 |
| extra | jsonb | E열 이후 전체 |
| geocoder_used | text | 'kakao'/'vworld'/'juso' |

**`geocode_failures`**
| 컬럼 | 타입 |
|---|---|
| id, map_id, row_index, address_raw | |
| reason | text |
| attempted_providers | text[] |

**`geocode_cache`** (재업로드 가속)
| 컬럼 | 타입 |
|---|---|
| address_raw | text PK |
| address_normalized, lat, lng, provider | |
| cached_at | timestamptz |

**`audit_log`** (선택)
| 컬럼: id, map_id, action, ip_hash, user_agent, ts |

**`reports`** (신고)
| 컬럼: id, map_id, reason, reporter_ip_hash, status(`pending`/`resolved`), created_at |

### 5.2 인덱스
- `maps(slug)`, `maps(is_listed, created_at desc)` (갤러리)
- `markers(map_id)`
- `geocode_cache(address_raw)`

### 5.3 URL 구조
- 공개: `/m/{slug}`
- 관리: `/m/{slug}/admin/{admin_token}`
- 생성: `/new`
- 템플릿 다운로드: `/template.xlsx` (정적, `public/`)
- 갤러리(홈): `/`
- 관리자 대시보드(신고 처리): `/staff?token=...`

---

## 6. 업로드·처리 플로우 (`/new`)

### 6.1 단계

1. **사전 안내**: 상단에 `[엑셀 템플릿 다운로드]`. "A열 주소 필수, 나머지 선택" 1줄 안내.
2. **파일 업로드**: 드래그&드롭 또는 파일 선택. SheetJS로 클라이언트 파싱.
3. **검증** (클라이언트):
   - 헤더가 템플릿과 불일치 → 인라인 에러
   - 빈 파일 / > 10,000행 → 에러
   - 주소 빈 행은 스킵 목록으로 표시
4. **미리보기 & 메타 입력**:
   - 지도 제목(필수), 설명, 갤러리 노출 체크박스
   - 샘플 3행 표시
5. **생성 요청**: `POST /api/maps` (multipart: 엑셀 + 메타)
6. **지오코딩 진행 (서버)**:
   - SSE로 진행률 푸시 (`progress: 450/1247`)
   - 배치 호출 (Kakao 초당 10~20 한도 준수)
   - `geocode_cache` 우선 조회, 없으면 체인 호출
   - 공급자 실패 시 다음으로 폴백, 전부 실패 시 `geocode_failures`에 기록
7. **완료**: `slug`, `admin_token` 응답. 화면에 공유 URL + 관리 URL + 실패 CSV 다운로드 + "관리 URL 이메일 전송" 옵션.

### 6.2 재업로드 (관리 URL)
- 동일 `slug`, `admin_token` 유지
- 기존 `markers`, `geocode_failures` 삭제 후 새로 생성
- `geocode_cache` 활용 → 동일 주소는 API 호출 없이 즉시 재사용
- 원본 엑셀 Storage 덮어쓰기

### 6.3 엑셀 템플릿 사양
- 파일명: `gonpunclaw-policymap-template.xlsx`
- 1행: 헤더 — **컬럼 위치는 고정**이지만 헤더 **텍스트는 편집 가능**. 템플릿은 `주소, 이름, 값, 분류, 비고`로 출고되며 사용자가 `주소→소재지`, `값→지원금(원)`, `분류→시설유형` 등으로 바꿔도 무방. 서버는 위치(A/B/C/D/E+)로 해석하고 각 헤더 텍스트를 `value_label` / `category_label`로 저장해 뷰어에 반영.
- 2~4행: 예시 데이터 (삭제 권장 주석)
- A열 주소만 필수, 나머지 선택
- E열 이후는 자유 컬럼 → 마커 팝업에 원본 그대로 표시

---

## 7. 뷰어 UX (`/m/{slug}`)

### 7.1 데스크탑 레이아웃
- 좌측 패널(320px): 제목·설명, 필터(분류 체크, 값 범위 슬라이더), 범례, 총 마커 수
- 중앙: MapLibre 지도 (OSM 타일)
- 상단바: 공유 버튼, 홈 링크

### 7.2 모바일
- 상단 접이식 패널 + 지도 풀스크린
- 필터는 하단 시트(bottom sheet)

### 7.3 마커 규칙
- 색상: 분류별 자동 팔레트 (최대 12종, 이후 회색 Other)
- 크기: `value` 정규화 → 8~24px 반경
- 클러스터링: 줌아웃에서 자동 집계 버블 (Supercluster)
- 클릭 팝업: `name, address_normalized, value, category, extra(JSONB 풀어서)`

### 7.4 컨트롤·범례
- 우상단: 줌 +/-, 현위치, 전체보기 리셋
- 우하단: © OSM + 지오코딩 공급자 표기
- 좌하단: 스케일바

### 7.5 공유·SEO
- `[공유]` → URL 복사
- OG 이미지: `@vercel/og`로 지도 썸네일 자동 생성
- SSR 메타태그: 제목, 설명, 마커 수
- `is_listed=true` 지도만 `/sitemap.xml` 등록

### 7.6 성능
- 마커 JSON: gzip 압축 후 전송 (1,247건 ≈ 100KB)
- MapLibre WebGL 렌더 → 수천 건 프레임드롭 없음

---

## 8. 관리 UX (`/m/{slug}/admin/{token}`)

### 8.1 화면 구성
- 상단 경고: "이 URL은 공유하지 마세요"
- 기본 정보: 제목, 설명 수정, 갤러리 노출 토글, 원본 엑셀 다운로드
- 데이터 교체: 새 엑셀 드래그&드롭 (슬러그·URL 유지)
- 현재 상태: 마커 수, 실패 수, 생성/수정 시각, 공급자별 성공 수
- 다운로드: 실패 주소 CSV, 전체 마커 CSV
- 위험 구역: 삭제 (확인 모달)

### 8.2 보안
- `admin_token`은 URL 경로에만 노출. 클라이언트는 해당 토큰을 요청 헤더로만 사용하고 로컬 저장·외부 전송 금지
- 모든 쓰기 API: `admin_token` 검증 미들웨어 필수
- DB에는 `SHA-256(HMAC, pepper)` 해시만 저장. 서버가 요청 토큰을 동일 해시로 변환해 비교.
- 시도 rate limit: IP당 10분 5회 실패 → 차단
- 토큰 길이 32자(≈190 bit 엔트로피)이므로 brute-force 비현실적

### 8.3 분실 대응
- 지도 완료 화면에서 "관리 URL을 본인 이메일로 보내기" 1회 기능 제공 (이메일 미저장)
- 그래도 분실하면 복구 불가. 새 지도 생성 안내. (무인증이라 본인 확인 불가)

### 8.4 삭제
- `maps` 삭제 + `markers`, `failures`, `reports` CASCADE
- Storage 원본 엑셀 삭제
- 슬러그 재사용 방지 차원에서 `deleted_slugs(slug, deleted_at)`에 기록, 30일 후 정리

---

## 9. 홈페이지·디스커버리 (`/`)

### 9.1 구성
- 히어로: 한 줄 설명 + `[엑셀 템플릿 받기]` / `[지도 만들기]`
- 최근 공개 지도 카드 그리드 (`is_listed=true` 최신순)
- 이용 안내 3단계
- 하단: 소개, 문의, 오픈소스 링크, © 공픈클로

### 9.2 갤러리 정책
- 카드: 썸네일(자동 OG) + 제목 + 마커 수 + 상대 시간
- 탭: `최신` / `인기(조회수)` (조회수는 Supabase 단순 증가 카운터)
- 24개 무한 스크롤

### 9.3 검색 (MVP)
- 제목·설명 `ilike` 부분 일치만

### 9.4 스팸·악용 대응
- 업로드 rate limit: IP당 1시간 3건
- 신고 버튼: 뷰어에서 `...` 메뉴 → `신고` → `reports` 테이블
- 관리자(`/staff?token=...`)가 큐 확인, `is_listed=false` 또는 삭제
- 업로드 파일 크기 ≤ 2MB, 행 수 ≤ 10,000 서버 검증

---

## 10. 테스트·에러 처리·운영

### 10.1 테스트 전략
- **단위 (Vitest):**
  - 엑셀 파서: 헤더 검증, 빈 셀, 초과 행, 고정 테스트 파일 10종
  - 지오코딩 체인: 각 공급자 mock, 폴백 순서, 캐시 히트
  - `admin_token` 미들웨어: 일치/불일치/rate-limit
  - 슬러그 생성: 중복 회피, 금칙어(`admin`, `api`, `new`, `m`, `staff`)
- **통합 (API 라우트 단위):** 파일 업로드→지오코딩(mock)→DB 저장→응답 / 재업로드 / 삭제 CASCADE
- **E2E (Playwright, 핵심 플로우):** 템플릿→업로드→지도 확인, 관리 URL 수정, 갤러리 토글

### 10.2 에러 매트릭스
| 상황 | 동작 |
|---|---|
| 헤더 불일치 | 업로드 차단, 인라인 에러 |
| 파일 손상 | "엑셀에서 다시 저장해주세요" |
| 파일 > 2MB / > 10,000행 | "분할 업로드 권장" |
| 주소 공란 | 스킵 후 "N행 건너뜀" 표시 |
| 지오코딩 전체 실패 | `failures`에 기록 + CSV 제공 |
| 공급자 한도 초과 | 자동 폴백, 전부 실패 시 "일시 한도 초과" |
| `admin_token` 불일치 | 404 (존재 자체 은폐) |
| Rate limit 초과 | 429 + "잠시 후 재시도" |
| DB 쓰기 실패 | 트랜잭션 롤백, "일시 오류" |

### 10.3 관측성
- Vercel + Supabase 기본 대시보드
- Sentry 에러 캡처
- `/staff` 관리자 보드에 일일 지오코딩 성공률, 공급자별 콜 수

### 10.4 운영
- Supabase 일일 자동 백업 (무료 티어)
- 배포: `main` 푸시 → Vercel 자동, PR 프리뷰 제공
- 시크릿: Vercel 환경변수만 사용, Git 커밋 금지

---

## 11. 일정 및 이정표 (목표)

| 주차 | 산출물 |
|---|---|
| W1 | repo 생성, Next.js 스캐폴드, Supabase 프로젝트 생성, 스키마 마이그레이션, `.env.example` |
| W2 | 엑셀 파서 + 템플릿, `POST /api/maps` (Kakao만), SSE 진행률, 완료 화면 |
| W3 | 뷰어(MapLibre + 마커 + 클러스터 + 팝업 + 필터), OG 이미지, SSR 메타 |
| W4 | 관리 페이지(수정/교체/삭제/토글), 폴백 체인(VWorld/Juso), 캐시 테이블 |
| W5 | 홈 갤러리, 검색, 신고, 관리자 보드, E2E 테스트, 배포 |

---

## 12. 미래 과제 (v1.1+)

- 타임라인/스냅샷 히스토리
- 시군구 집계 choropleth 오버레이 토글
- 히트맵 토글
- iframe 임베드 코드 생성
- 필터 상태 URL 공유(쿼리 파라미터)
- 태그·카테고리 계층
- 다국어 (영문)
- 공공데이터포털 URL로 직접 연결 업로드
- PDF/PNG 내보내기 (보고서 삽입용)
