# Vercel Env Quick Sheet

Vercel → Project Settings → Environment Variables 에 그대로 옮겨 적기 위한 초압축 입력표입니다.

## Production에 넣을 값

| Key | Value | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://pwpflvaaqcxbmpqfaxms.supabase.co` | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` key | yes |
| `ADMIN_TOKEN_PEPPER` | `openssl rand -hex 32` 결과 | yes |
| `STAFF_DASHBOARD_TOKEN` | `openssl rand -base64 24` 결과 | yes |
| `GEOCODER_PRIORITY` | `kakao,vworld,juso` | yes |
| `KAKAO_REST_API_KEY` | Kakao REST API key | recommended |
| `VWORLD_API_KEY` | VWorld API key | optional |
| `JUSO_API_KEY` | Juso API key | optional |
| `SENTRY_DSN` | Sentry DSN | optional |

## 바로 생성하는 명령

### ADMIN_TOKEN_PEPPER
```bash
openssl rand -hex 32
```

### STAFF_DASHBOARD_TOKEN
```bash
openssl rand -base64 24
```

## 가장 짧은 체크 순서
1. Vercel 로그인
2. `gonpunclaw-policymap` 프로젝트 연결
3. 위 9개 값 중 필요한 것 입력
4. 최소 1개 이상 지오코더 키 입력
5. Production 재배포
6. `/upload`, `/staff/audit`, `/staff/reports` 확인

## 절대 실수하면 안 되는 것
- `SUPABASE_SERVICE_ROLE_KEY`는 공개 저장소/커밋 금지
- `ADMIN_TOKEN_PEPPER`, `STAFF_DASHBOARD_TOKEN`도 커밋 금지
- 지오코더 키 없는 상태로 배포하면 업로드 후 좌표 변환이 실패할 수 있음
