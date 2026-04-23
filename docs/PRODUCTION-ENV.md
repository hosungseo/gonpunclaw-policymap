# Production Env Guide

`gonpunclaw-policymap` 배포 시 필요한 환경변수를 실제 입력 관점에서 정리한 문서입니다.

## 1. 필수 환경변수

| 변수명 | 필수 | 어디서 가져오나 | 입력 예시/형식 | 메모 |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 예 | Supabase 프로젝트 Settings → API | `https://pwpflvaaqcxbmpqfaxms.supabase.co` | 클라이언트 노출 가능 값 |
| `SUPABASE_SERVICE_ROLE_KEY` | 예 | Supabase 프로젝트 Settings → API | `sb_secret_...` | **절대 공개 금지** |
| `ADMIN_TOKEN_PEPPER` | 예 | 직접 생성 | `openssl rand -hex 32` 결과 | 관리 토큰/IP 해시용 |
| `STAFF_DASHBOARD_TOKEN` | 예 | 직접 생성 | `openssl rand -base64 24` 결과 | `/staff/*` 로그인용 |

## 2. 지오코더 관련
최소 1개 이상은 있어야 업로드 후 주소를 실제 좌표로 바꿀 수 있습니다.

| 변수명 | 필수 | 어디서 가져오나 | 입력 예시/형식 | 메모 |
| --- | --- | --- | --- | --- |
| `KAKAO_REST_API_KEY` | 권장 | Kakao Developers | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | 우선순위 1로 쓰기 좋음 |
| `VWORLD_API_KEY` | 선택 | VWorld OpenAPI | 발급 키 문자열 | 국내 주소 fallback 용도 |
| `JUSO_API_KEY` | 선택 | 도로명주소 API | 발급 키 문자열 | 추가 fallback |
| `GEOCODER_PRIORITY` | 예 | 직접 입력 | `kakao,vworld,juso` | 키가 있는 provider 순서대로 정렬 |

## 3. 선택 환경변수

| 변수명 | 필수 | 어디서 가져오나 | 입력 예시/형식 | 메모 |
| --- | --- | --- | --- | --- |
| `SENTRY_DSN` | 아니오 | Sentry 프로젝트 Settings | `https://...@....ingest.sentry.io/...` | 없으면 비워도 됨 |

## 4. 그대로 옮겨 적는용 템플릿

```bash
NEXT_PUBLIC_SUPABASE_URL=https://pwpflvaaqcxbmpqfaxms.supabase.co
SUPABASE_SERVICE_ROLE_KEY=

KAKAO_REST_API_KEY=
VWORLD_API_KEY=
JUSO_API_KEY=
GEOCODER_PRIORITY=kakao,vworld,juso

ADMIN_TOKEN_PEPPER=
STAFF_DASHBOARD_TOKEN=

SENTRY_DSN=
```

## 5. 생성 명령

### ADMIN_TOKEN_PEPPER
```bash
openssl rand -hex 32
```

### STAFF_DASHBOARD_TOKEN
```bash
openssl rand -base64 24
```

## 6. Vercel에 넣을 때 순서
1. 프로젝트 선택
2. Settings → Environment Variables
3. 위 변수들을 **Production** 환경에 입력
4. 저장 후 재배포

## 7. 입력 후 확인 포인트
- `NEXT_PUBLIC_SUPABASE_URL` 오타 없는지
- `SUPABASE_SERVICE_ROLE_KEY` 앞뒤 공백 없는지
- 지오코더 키 최소 1개 이상 들어갔는지
- `ADMIN_TOKEN_PEPPER`, `STAFF_DASHBOARD_TOKEN` 직접 생성값 넣었는지
- `GEOCODER_PRIORITY`가 실제 입력한 키 순서와 맞는지

## 8. 보안 메모
- `SUPABASE_SERVICE_ROLE_KEY`는 절대 GitHub에 커밋하지 않음
- `ADMIN_TOKEN_PEPPER`, `STAFF_DASHBOARD_TOKEN`도 같은 수준으로 비공개 취급
- `.env.local`, `.env.production` 실파일은 원격에 올리지 않음
- 유출 의심 시 즉시 재발급 후 재배포
