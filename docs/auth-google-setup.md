# Google OAuth 셋업 가이드

> BaroSit 마케팅 사이트 (`#/login`) 의 Google 로그인 버튼이 동작하려면
> Supabase 프로젝트와 Google Cloud OAuth 2.0 Client 가 연결되어 있어야 합니다.
> 본 문서는 처음 셋업하는 사람을 위한 단계별 안내입니다.
>
> 코드 쪽 작업 (Supabase 클라이언트 · useAuth · 콜백 라우트 · Profile 연결) 은
> 이미 완료되어 있습니다. 본 문서의 외부 셋업만 끝내면 즉시 동작합니다.

## 0. 사전 확인

| 확인 | 명령 / 위치 |
|---|---|
| `@supabase/supabase-js` 설치됨 | `package.json` 의존성 |
| `src/auth/supabase.ts`, `src/auth/useAuth.ts` 존재 | 본 sprint 에서 생성 |
| `.env.local` 비어 있음 또는 placeholder | `.env.example` 참고 |

## 1. Supabase 프로젝트 생성

1. https://supabase.com 접속 후 가입 (GitHub 로 가입 가능)
2. **New project**
   - **Name**: `barosit` (자유)
   - **Database password**: 강한 비밀번호 (관리자 콘솔/SQL 접속용. 자주 안 씀)
   - **Region**: `Northeast Asia (Seoul)` — `ap-northeast-2`
   - **Pricing plan**: Free
3. 생성 후 약 1분 대기 (DB 프로비저닝)
4. **Settings → API** 에서 두 값 복사:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
5. 프로젝트 루트에 `.env.local` 만들고 채우기:
   ```bash
   VITE_SUPABASE_URL=https://abcd1234efgh.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc...
   ```

> ⚠️ anon key 는 public 노출 OK (브라우저 번들에 포함됨). 데이터 보호는 RLS 가 담당.
> service_role key 는 절대 클라이언트에 노출 금지.

## 2. Google Cloud OAuth Client 생성

### 2-1. Google Cloud Console 프로젝트

1. https://console.cloud.google.com 접속
2. 상단 프로젝트 선택기 → **New Project**
   - **Name**: `BaroSit Auth` (자유)
3. 생성 후 해당 프로젝트로 전환

### 2-2. OAuth Consent Screen

1. 좌측 메뉴 → **APIs & Services → OAuth consent screen**
2. **User Type**: External (Google Workspace 사용자만 대상이라면 Internal)
3. **App information**:
   - **App name**: `BaroSit`
   - **User support email**: `jhlee@gubed.co.kr`
   - **App logo**: 선택. 없으면 생략
4. **App domain** (Publishing 단계에서 필요. 도메인 없으면 일단 비워둠)
5. **Developer contact**: `jhlee@gubed.co.kr`
6. **Scopes**: 기본 (email · profile · openid) 만 추가. 추가 scope 불필요
7. **Test users**: 자기 본인 Gmail 추가 (배포 전까지 테스트 모드면 등록된 사용자만 로그인 가능)
8. **Save and continue**

> 🔁 출시 단계에서 **Publish app** 눌러야 누구나 로그인 가능.
> 단, 그 전에 Google 검토 (verification) 가 필요할 수 있음 (sensitive scope 안 쓰면 면제).

### 2-3. OAuth Client ID

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. **Application type**: **Web application**
3. **Name**: `BaroSit Supabase` (관리용)
4. **Authorized JavaScript origins** — 다음 모두 추가:
   - `http://localhost:1430`
   - `https://barosit.com` (도메인 구매 후)
   - `https://barosit.pages.dev` (Cloudflare Pages 검증용, 도메인 전엔 필수)
5. **Authorized redirect URIs** — Supabase 콜백 URL 한 줄만 추가:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
   `<your-project-ref>` 는 `VITE_SUPABASE_URL` 의 서브도메인 부분 (예: `abcd1234efgh`).

   > Google → Supabase → BaroSit 순서로 리다이렉트되기 때문에 Google 에 등록할 URI 는
   > **Supabase 콜백 한 줄** 입니다. BaroSit 자체의 `/auth/callback` 은 Google 이 아닌
   > Supabase 가 호출합니다.

6. **Create** → 모달에 표시되는 **Client ID** · **Client secret** 복사

## 3. Supabase 에 Google Provider 연결

1. Supabase Dashboard → **Authentication → Providers**
2. **Google** 행 클릭 → 토글 **Enabled**
3. 필드 채우기:
   - **Client ID (for OAuth)**: 위 2-3 에서 받은 Client ID
   - **Client Secret (for OAuth)**: 위 2-3 에서 받은 Client Secret
4. **Skip nonce check**: 기본값 (OFF) 유지
5. **Save**

## 4. Supabase Site URL / Redirect URLs

OAuth 가 끝나면 Supabase 가 어디로 사용자를 다시 보낼지 명시해야 합니다.

1. Supabase Dashboard → **Authentication → URL Configuration**
2. **Site URL** — production 기준 한 곳:
   ```
   https://barosit.com
   ```
   도메인 전이라면 일단 `https://barosit.pages.dev` 또는 `http://localhost:1430`
3. **Redirect URLs** — 허용 목록. 사용 환경 모두 추가:
   ```
   http://localhost:1430/#/auth/callback
   https://barosit.pages.dev/#/auth/callback
   https://barosit.com/#/auth/callback
   ```
   > 본 앱은 hash router 라 `#/auth/callback` 입니다. trailing slash 없는 형태 그대로.

## 5. 로컬에서 검증

```bash
# .env.local 채워졌는지 확인
cat .env.local

# dev 서버 재시작 (env 는 시작 시점에 읽힘)
npm run dev:web
# → http://localhost:1430

# 1. http://localhost:1430/#/login 에서 "Google로 계속하기" 클릭
# 2. Google 로그인 화면 → 계정 선택
# 3. consent 화면 (테스트 모드면 "Google hasn't verified this app" 경고 → 진행)
# 4. http://localhost:1430/#/auth/callback?code=... 로 돌아옴
# 5. "로그인 마무리 중…" 잠깐 표시 후 → http://localhost:1430/#/profile
# 6. 헤더 우측에 아바타 + 이름 표시. Profile 의 "계정" 탭에 Google 정보 표시
```

## 6. 흔한 에러

| 증상 | 원인 / 해결 |
|---|---|
| "redirect_uri_mismatch" | Google Cloud Console 의 Authorized redirect URIs 에 Supabase 콜백 URL 누락. 2-3 단계 5번 확인 |
| "Invalid login credentials" / 콜백에서 fail | Supabase Site URL / Redirect URLs 에 현재 도메인 미등록. 4번 단계 확인 |
| 로그인 후 `/profile` 로 못 감 | 브라우저 콘솔에 Supabase 에러 확인. `.env.local` 의 anon key 잘못된 경우가 잦음 |
| "Google hasn't verified this app" 경고 | OAuth consent screen 이 Publishing 전 (테스트 모드). 본인 Gmail 을 Test users 에 추가했는지 확인. 출시 시 Publish app |
| `IS_AUTH_CONFIGURED = false` 에러 | `.env.local` 변경 후 dev 서버 재시작 필요 (Vite 는 시작 시점에 env 로드) |

## 7. 다음 단계 (별도 sprint)

- [ ] **Kakao OAuth** — Supabase 의 "Sign in with OIDC" + Kakao Developers 검수 ([auth-sync-plan.md](./auth-sync-plan.md) 참고)
- [ ] **이메일 매직링크** — Supabase 이메일 템플릿 한글화 + signInWithOtp 흐름
- [ ] **데스크탑 OAuth (Tauri)** — deep link `barosit://auth/callback` + Rust keyring 토큰 저장
- [ ] **profiles 테이블 + RLS** — 표시 이름·작업환경 등 사용자 편집 가능 데이터
- [ ] **Apple OAuth** — Mac App Store 출시 시점 (Apple Developer $99/년)
