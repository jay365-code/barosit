# BaroSit 배포·시크릿 체크리스트 (Production Deployment Checklist)

> 출시 전 1회 점검. 시크릿은 **절대 repo 에 커밋하지 않는다** (`.env.local`·GitHub Secrets·Supabase Secrets·대시보드에만).

## 1. 환경변수 / 시크릿 위치별 정리

### 1.1. 프론트엔드 빌드 (`.env.local` / Cloudflare Pages 환경변수 / **GitHub Secrets**) — `VITE_` 접두사만 번들에 포함

> ⚠️ 주입 지점이 **세 곳**이다. 로컬은 `.env.local`, 웹은 Cloudflare Pages 환경변수,
> **데스크톱 앱은 GitHub Secrets**(`release.yml`·`windows-msix.yml`). 웹만 설정하고
> GitHub Secrets 를 빠뜨리면 웹은 정상인데 앱에서만 결제가 죽는다 — v0.9.13 까지 실제로 그랬다.
> 폴백이 없는 `VITE_TOSS_CLIENT_KEY` 만 증상이 드러나고, 나머지는 소스 폴백으로 조용히 넘어간다.
| 키 | 값 | 비고 |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | anon key 와 함께 public 노출 OK |
| `VITE_SUPABASE_ANON_KEY` | anon JWT | RLS 가 보호 |
| `VITE_TOSS_CLIENT_KEY` | `test_ck_...` → `live_ck_...` | **클라이언트 키만**. Secret 키는 절대 프론트에 두지 않음 |
| `VITE_LAUNCH_MODE` | `beta_free` / `paid` | 빌드 기본값. 원격(app_config)이 override |
| `VITE_AUTH_REDIRECT_BASE` | (선택) `https://barosit.com` | 보통 자동감지 |

### 1.2. Supabase Edge Functions Secrets (`supabase secrets set`)
| 키 | 값 | 비고 |
|---|---|---|
| `TOSS_SECRET_KEY` | `test_sk_...` → `live_sk_...` | **백엔드 전용**. 승인 전 테스트키로 전체 동작 가능 |
| `SUPABASE_URL` | (자동 주입) | 런타임 기본 제공 |
| `SUPABASE_SERVICE_ROLE_KEY` | (자동 주입) | 런타임 기본 제공 |
| `RESEND_API_KEY` | Resend 키 | 문의 메일(`send-inquiry-email`)용 |

### 1.3. Supabase 대시보드 — Auth Providers (config.toml 의 placeholder 는 로컬용)
- [ ] Google OAuth Client ID / Secret (prod)
- [ ] Kakao REST API Key / Client Secret (prod)
- [ ] (Mac App Store 시) Apple OAuth
- [ ] URL Configuration: Site URL = `https://barosit.com`, Redirect URLs 허용목록

### 1.4. GitHub Secrets (릴리스 CI — `release.yml`)
| 키 | 용도 | 상태 |
|---|---|---|
| `VITE_TOSS_CLIENT_KEY` | **데스크톱 앱 빌드타임 주입** — 없으면 앱에서 결제 진입이 즉시 실패 | ⬜ 등록 필요 |
| `TAURI_SIGNING_PRIVATE_KEY` / `_PASSWORD` | 자동 업데이트 minisign 서명 | ✅ 등록됨 |
| `APPLE_CERTIFICATE` / `_PASSWORD` / `APPLE_SIGNING_IDENTITY` / `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | macOS 코드서명·공증 | ✅ 등록됨 |
| (선택) Windows 코드서명 인증서 | SmartScreen 회피 | ⬜ 인증서 구매 후 |

## 2. 배포 순서

1. [ ] **결제 백엔드**: `TOSS_SECRET_KEY=test_sk_... ./supabase/deploy-payments.sh` ([functions/README](../supabase/functions/README.md))
2. [ ] **pg_cron**: 대시보드에서 `pg_cron`/`pg_net` 활성화 → `migrations/20260521000010` 하단 `cron.schedule` 실행
3. [ ] **웹훅**: Toss 개발자센터에 `https://<ref>.supabase.co/functions/v1/toss-webhook` 등록
4. [ ] **웹**: `npm run build:web` → Cloudflare Pages 배포 (`barosit.com` 자동 배포 동작 확인)
5. [x] **데스크톱**: Apple Secrets 등록 및 `releaseDraft:false` 완료 → `git tag vX.Y.Z && git push --tags` (빌드 및 공증 자동 배포)
6. [ ] **런치 모드**: AdminDashboard "시스템" 탭에서 `beta_free`/`paid` 선택

## 3. 출시 전 검증

- [ ] 시크릿 노출 점검: `git grep -iE "sk_live|service_role|secret" -- ':!*.example' ':!docs/*'` → 결과 없음
- [ ] 테스트 카드 E2E: 결제 → 환불(7일·미사용) → 정기청구(charge-renewals 수동 호출) → 해지/복구
- [ ] `npm run test` (단위 테스트) + `npm run build:web` (타입체크) 통과
- [ ] 다운로드 링크 ↔ 릴리스 자산명 일치 (`BaroSit_<ver>_universal.dmg` / `BaroSit_<ver>_x64-setup.exe`) ✅ 코드 확인됨
