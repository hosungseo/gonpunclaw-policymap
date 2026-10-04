# PolicyMap 공개 데이터 API

공개(`public`) 또는 링크 공개(`unlisted`) 지도의 데이터를 읽기 전용으로 제공합니다. 비공개 지도는 404입니다. 인증과 API 키는 없습니다.

## 엔드포인트

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/public/maps?q=&page=` | 공개 디렉터리 목록 (`public` 지도 중 디렉터리 숨김 제외). 24개/페이지 |
| GET | `/api/public/maps/{slug}` | 지도 메타데이터 + 마커 JSON |
| GET | `/api/public/maps/{slug}/geojson` | GeoJSON FeatureCollection (`application/geo+json`) |

모든 엔드포인트는 `OPTIONS`(CORS preflight, `204`)에도 응답합니다.

## 응답 예시 (`/api/public/maps/{slug}`)

```json
{
  "ok": true,
  "map": {
    "slug": "abc123xy",
    "title": "복지시설 현황",
    "description": "",
    "visibility": "public",
    "source_name": "○○시 복지과",
    "source_url": "https://...",
    "data_as_of": "2026-03-31",
    "owner_department": "복지정책과",
    "contact": null,
    "license": "공공누리 제1유형",
    "refresh_cycle": null,
    "published_at": "2026-04-01T09:00:00.000Z",
    "last_data_update_at": "2026-04-02T01:00:00.000Z",
    "version_number": 3,
    "review": { "required": true, "status": "approved" },
    "value_label": "정원",
    "value_unit": "명",
    "category_label": "시설 유형",
    "api": {
      "json": "https://gonpunclaw-policymap.vercel.app/api/public/maps/abc123xy",
      "geojson": "https://gonpunclaw-policymap.vercel.app/api/public/maps/abc123xy/geojson",
      "map": "https://gonpunclaw-policymap.vercel.app/m/abc123xy",
      "embed": "https://gonpunclaw-policymap.vercel.app/embed/abc123xy"
    }
  },
  "markers": [
    { "id": "…", "name": "○○복지관", "category": "복지", "value": 48, "address": "…", "lat": 37.48, "lng": 127.03, "extra": { "담당": "지역복지팀" } }
  ]
}
```

- `review.status`는 `none`(검토 옵션 꺼짐) · `pending`(검토 대기 또는 승인 뒤 데이터 변경) · `approved`(승인 버전이 현재 버전) 중 하나입니다.
- `api.*`의 절대 주소는 기본적으로 `https://gonpunclaw-policymap.vercel.app`을 기준으로 만들며, 요청 호스트가 서비스 도메인·`*.vercel.app` 미리보기·localhost인 경우에만 그 호스트를 그대로 씁니다.

GeoJSON은 같은 `map` 객체를 최상위 `properties`에, 각 마커를 `Point` Feature로 담습니다. 좌표 순서는 `[lng, lat]`이며 Feature `properties`에는 `lat`·`lng`를 뺀 나머지 마커 필드가 들어갑니다. 응답에는 `Content-Disposition: inline; filename="{slug}.geojson"`이 붙습니다.

## 디렉터리 목록 (`/api/public/maps`)

```json
{
  "ok": true,
  "maps": [
    {
      "slug": "abc123xy",
      "title": "복지시설 현황",
      "description": "",
      "source_name": "○○시 복지과",
      "owner_department": "복지정책과",
      "data_as_of": "2026-03-31",
      "published_at": "2026-04-01T09:00:00.000Z",
      "last_data_update_at": "2026-04-02T01:00:00.000Z",
      "marker_count": 120,
      "reviewed": true,
      "api": { "json": "…", "geojson": "…", "map": "…", "embed": "…" }
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 24,
  "total_pages": 1
}
```

- `q`는 제목·설명·담당 부서를 부분 일치로 검색합니다(최대 80자). `, ( ) % _ \ " *` 문자는 제거됩니다.
- `page`는 1부터 시작합니다. 숫자가 아니거나 1 미만이면 1페이지로 처리하고, 마지막 페이지를 넘어가면 오류 대신 빈 `maps`를 돌려줍니다.
- 정렬은 발행일 내림차순, 같은 발행일이면 수정일 내림차순입니다.
- 링크 공개(`unlisted`) 지도와 스태프가 디렉터리에서 숨긴 지도는 목록에 나오지 않습니다. 단건 API·지도 링크·임베드로는 계속 접근할 수 있습니다.

## 포함되는 것 / 포함되지 않는 것

- 포함: 발행 시 공개로 선택한 열(`extra`), 정규화 주소, 이름·분류·대표값, 출처·기준일·관리 주체·문의처·이용조건·갱신주기·발행일·갱신일, 버전 번호, 검토 상태, 대표값·분류 라벨.
- 제외: 원본 주소 문자열, 행 번호, 지오코더 공급자, 품질 상태, 제외 처리된 행, 검수 사유, 관리 정보.

## 오류 응답

```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "지도를 찾을 수 없습니다." } }
```

| 상태 | code | 의미 |
| --- | --- | --- |
| 404 | `NOT_FOUND` | 지도가 없거나 비공개 |
| 429 | `RATE_LIMITED` | 호출 한도 초과. `Retry-After`(초) 헤더 포함 |
| 500 | `UPSTREAM` | 디렉터리 목록 조회 실패 |

## 캐시·제한

- `Cache-Control: public, s-maxage=300, stale-while-revalidate=60`
- 단건·GeoJSON 응답은 약한 `ETag`(`W/"…"`)를 돌려줍니다. 메타데이터 수정일, 데이터 갱신일, 버전 번호, 검토 상태, 표시 마커 수가 바뀌면 값이 달라집니다. `If-None-Match`가 일치하면 `304`
- CORS: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, OPTIONS`, `Access-Control-Allow-Headers: If-None-Match`, `Access-Control-Expose-Headers: ETag, Retry-After`
- 레이트리밋: IP당 분당 120회(세 엔드포인트 합산). 초과 시 `429`와 `Retry-After`

## 이용조건

`license` 필드는 업로드 기관이 입력한 값 그대로입니다. 비어 있으면 해당 기관에 이용조건을 확인하세요. 데이터 내용의 책임은 업로드 기관에 있으며, 서비스는 전달만 합니다.

## 임베드

```html
<iframe src="https://gonpunclaw-policymap.vercel.app/embed/{slug}?view=table"
  title="지도 제목" style="width:100%;aspect-ratio:4/3;border:0;min-height:480px"
  loading="lazy" allowfullscreen></iframe>
```

`/embed/{slug}`는 `frame-ancestors *`로 어떤 사이트에서든 iframe에 넣을 수 있고, 검색 엔진에는 `noindex`입니다. 그 밖의 모든 화면은 `frame-ancestors 'self'`라 외부 사이트에 넣을 수 없습니다.

공개 지도 화면의 **공유 → 임베드 코드 복사**가 현재 필터를 포함한 코드를 만들어 줍니다. `/m/{slug}`와 `/embed/{slug}` 모두 아래 쿼리 파라미터로 초기 상태를 지정할 수 있습니다.

| 파라미터 | 값 | 설명 |
| --- | --- | --- |
| `cat` | 분류 이름, 반복 가능 (`cat=복지&cat=청년`) | 선택한 분류. 생략하면 전체, `cat=`(빈 값)이면 아무것도 선택하지 않음. 지도에 없는 분류는 무시 |
| `min`, `max` | 숫자 | 대표값 범위. 둘 다 있고 `min <= max`일 때만 적용 |
| `q` | 문자열(200자) | 검색어 |
| `view` | `map` \| `table` | 보기 모드. 기본 `map` |
| `bnd` | `sido` \| `sigg` \| `emd` | 행정구역 경계 레이어와 단계 |
| `pop` | `1` | 정책 기준 레이어(인구감소지역) 켜기 |
| `region` | 5자리 시군구 코드 | 정책 기준 레이어에서 선택한 지역. 지정하면 `pop=1`로 간주 |

뷰어는 필터를 바꿀 때 주소창을 함께 갱신하며(히스토리 항목 추가 없음), 위 목록에 없는 쿼리 파라미터는 그대로 보존합니다.
