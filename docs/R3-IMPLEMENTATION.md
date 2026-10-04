# PolicyMap R3 구현 메모

R3는 PRD의 P2 범위(FR-PM-013 협업과 승인, FR-PM-014 임베드와 공개 API, 공개 지도 디렉터리)를 **계정 없이** 구현한다. 역할·초대 기반 권한은 범위에서 제외했고, 지도별 옵션으로 켜는 검토 토큰 승인 게이트로 대체했다. 모든 기능은 기존 `maps.visibility`, `map_versions`, `audit_log`, 관리 토큰(HMAC)·스태프 쿠키 인증 위에 얹힌다.

## 구현 범위

### 공유·임베드

- 공개 지도 필터 상태(분류·값 범위·검색·보기·경계·인구감소 레이어·선택 지역)를 URL 쿼리로 동기화한다(`src/lib/share/url-state.ts`). 키는 `cat`(반복), `min`, `max`, `q`, `view`, `bnd`, `pop`, `region`이며 뷰어는 그 밖의 쿼리 파라미터를 보존한다. `/m/[slug]`, `/embed/[slug]`, `/demo`가 같은 파서를 쓴다.
- 뷰어 "공유" 팝오버(`src/components/map/SharePanel.tsx`): 현재 보기 링크, iframe 코드, 데이터 API 주소 복사. 클립보드가 막혀 있으면 직접 복사할 수 있는 텍스트를 보여 준다.
- `/embed/[slug]` — 축소 크롬, `Content-Security-Policy: frame-ancestors *`, `noindex`. 그 밖의 모든 경로는 `frame-ancestors 'self'`(`next.config.ts`).

### 공개 데이터 API (`docs/PUBLIC-API.md`)

- `/api/public/maps`(디렉터리 목록), `/api/public/maps/[slug]`(JSON), `/api/public/maps/[slug]/geojson`.
- public·unlisted 허용, private 404. 응답 헤더는 `Cache-Control: public, s-maxage=300, stale-while-revalidate=60`, 약한 ETag(`updated_at`·`last_data_update_at`·버전 번호·검토 상태·표시 마커 수), CORS `*`, `Access-Control-Expose-Headers: ETag, Retry-After`. 레이트리밋은 IP당 분당 120회(`LIMITS.publicApi`).
- 절대 링크(`api.json` 등)는 요청 호스트가 서비스 도메인·`*.vercel.app`·localhost일 때만 그 호스트를 쓰고, 그 외에는 `SITE_ORIGIN`으로 고정한다(`requestOrigin`).
- 뷰어·임베드·검토·API가 `src/lib/maps/load-public-map.ts`의 한 로더를 공유한다. 조회 오류는 빈 지도로 렌더하지 않고 예외로 올린다.

### 공개 지도 디렉터리

- `/maps` — `public_directory_maps` 뷰(`visibility = 'public' and directory_hidden = false`), 검색(제목·설명·담당 부서, `, ( ) % _ \ " *` 제거)·24개 페이지네이션, 검토 완료 배지. 마지막 페이지를 넘는 `?page=`는 빈 페이지로 응답한다. Supabase 조회가 실패해도 제목·검색창·API 안내는 그대로 렌더하고 오류 배너만 추가한다.
- 스태프 숨김: `/staff/reports`의 신고 행에서 `public` 지도에만 "디렉터리 숨김/표시" 버튼을 제공한다(`/api/staff/maps/directory`, 사유 300자). 감사 `map.directory_hide` / `map.directory_show`.
- 숨김 지도는 `/maps`·사이트맵·`/api/public/maps` 목록에서만 빠진다. 지도 링크·임베드·단건 API는 그대로 열리며, 관리 페이지에 숨김 안내가 표시된다.
- 홈·사이트맵에 `/maps` 링크를 추가했고, 링크 공개(`unlisted`) 지도 페이지는 `noindex`다.

### 검토·승인 (경량판)

- 스키마: `maps.review_required`, `review_token_hash`(`review:` 접두어로 관리 토큰과 도메인 분리한 HMAC), `approved_version_id`, `map_reviews` 이력 테이블. 지도당 pending 1건은 부분 유니크 인덱스(`status = 'pending'`)로 강제한다.
- 소유자 흐름(관리 페이지 "검토·승인"): "공개 전 검토 필수"를 켜면 검토 링크가 한 번만 표시된다(재발급 가능, 이전 링크 즉시 무효). "검토 요청"은 현재 버전을 가리키는 pending 행을 만든다(버전이 없으면 먼저 스냅샷을 뜬다). 라우트: `/api/maps/[slug]/review/{settings,request}` — 관리 토큰 필요.
- 검토자 흐름: `/review/[slug]?t=` — 미리보기 + 메타데이터·품질·공개 추가정보 열의 민감 헤더 검사 + 체크리스트 4항목(출처, 기준일, 민감정보, 공개 범위) + 승인/반려. 승인은 4항목 모두 확인, 반려는 의견 필수. 라우트: `/api/maps/[slug]/review/decide` — 검토 토큰 필요. 페이지는 `noindex`, 주소창에서 `?t=`를 즉시 제거하며 `Referrer-Policy: no-referrer`를 보낸다. 토큰 실패는 404 + 감사 `review.auth_fail`.
- 승인은 검토자가 본 버전에 고정된다. 요청 이후 소유자가 데이터를 교체·복원해 현재 버전이 바뀌었으면 승인 시도는 `[자동 반려]`로 기록되고 `409 VERSION_CHANGED`를 돌려준다. 같은 요청을 두 번 결정하면 `409 ALREADY_DECIDED`, 대기 요청이 없으면 `409 NO_PENDING_REVIEW`.
- 게이트(`src/lib/reviews/gate.ts`): private → public/unlisted 전환 시 `approved_version_id === current_version_id`가 아니면 `409 REVIEW_REQUIRED`. 업데이트 라우트와 업로드 발행 라우트 양쪽에 적용된다. public ↔ unlisted 전환과 private로 내리는 전환은 막지 않는다.
- 승인 무효화: 데이터 교체·복원으로 현재 버전이 바뀌면 공개 배지가 "검토 대기"로, 관리 페이지는 "재검토 필요"로 바뀐다. 출처·출처 URL·기준일·담당 부서를 수정하면 같은 쓰기에서 `approved_version_id`를 비운다(한 요청으로 메타데이터를 바꾸면서 공개 전환하는 것도 막힌다).
- 감사: `map.review_settings`, `map.review_request`, `map.review_approve`, `map.review_reject`(자동 반려 포함), `review.auth_fail`.

## 배포 순서

1. Supabase에 `supabase/migrations/0008_r3_collaboration.sql`을 적용한다.
2. 기존 Vercel 환경변수 그대로 새 빌드를 배포한다(새 환경변수 없음).
3. 작은 공개 지도에서 공유 링크 복원, `/embed`, `/api/public/maps/[slug]`, `/maps`, 검토 토글 → 요청 → 승인 → 공개 전환을 확인한다.

## 범위 밖 (다음 후보)

계정·다중 역할, 임베드 도메인 제한, API 키·쿼터, 디렉터리 큐레이션, GeoJSON 외 포맷.
