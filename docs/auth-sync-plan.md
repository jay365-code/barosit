# 인증 + 클라우드 동기화 계획 (Phase 1~4)

> 본 문서는 BaroSit 에 사용자 계정·다중 기기 동기화를 도입하기 위한 **단계별
> 실행 계획** 입니다. Phase 0 (로컬 프로필 UI 골격) 은 2026-05-19 완료. Phase
> 1~4 는 사용자가 본 계획서를 검토·승인한 뒤 진행합니다.

## ✅ 사전 결정 사항 (2026-05-20 확정)

| 항목 | 결정 | 비고 |
|---|---|---|
| 백엔드 | **Supabase** | Postgres + RLS, region `ap-northeast-2` (서울). 무료 tier 충분 |
| 인증 방식 | **매직링크 + Google + Kakao** | Apple 은 Mac App Store 출시 시점에 추가. **비밀번호 가입은 도입하지 않음** (재설정 흐름·해시 정책·보안 책임 절감). Kakao 는 Supabase native 미지원이라 "Sign in with OIDC" + Kakao Developers 앱 등록 경로로 연동 |
| 동기화 데이터 범위 | **(b) 점수 + 이벤트** 부터 시작, 이후 (c) 사용자 설정까지 확장 | 캘리브레이션 베이스라인은 기기별 저장 유지 |
| 마이그레이션 정책 | **(b) 기존 localStorage 옵트인 업로드** | 첫 로그인 시 "이 컴퓨터 데이터를 클라우드에 백업할까요?" 안내 모달 |
| 토큰 저장 위치 | **OS 키체인 (`keyring` crate)** | refresh token 누출 시 영구 계정 침해 위험 회피. 웹 풀버전은 sessionStorage + 짧은 lifetime |
| 가격 | **무료 출시** | 사용 추이 관찰 후 v0.3+ 에서 결정 |
| 마케팅·호스팅 | **Cloudflare Pages** | `dist-web/` 정적 빌드. 추후 백엔드 프록시 필요 시 같은 계정의 Cloudflare Workers 사용 |

## 영향 받는 기존 문서·코드

- [docs/privacy.md](./privacy.md) — **전면 재작성 필요**. 운영자가 사용자 정보를 보유하게 되므로 보유 기간·제3자 처리위탁(Supabase)·이용자 권리(삭제 요청 흐름)·해외 이전 명시
- [docs/terms.md](./terms.md) — 계정 약관 추가(가입·해지·정보 보호 책임)
- [src/views/Onboarding.tsx](../src/views/Onboarding.tsx) — "영상은 이 컴퓨터를 떠나지 않습니다" 카피 보정 (자세 메타데이터는 동의 시 클라우드 업로드 가능)
- [src/dataBackup.ts](../src/dataBackup.ts) — 클라우드 동기화 후에도 백업/복원 의미는 유지 (단일 기기 → 다른 기기 이동 등)

## Phase 1 — Supabase 셋업 + 인증 (~2-3일)

### 1-1. 백엔드 인프라
- [ ] Supabase 프로젝트 생성 — region: ap-northeast-2 (서울)
- [ ] 환경 변수 — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon key 는 public 노출 OK, RLS 가 데이터 보호)
- [ ] `.env.example` 추가, README 갱신

### 1-2. 인증 통합
- [ ] `npm install @supabase/supabase-js`
- [ ] [src/auth/supabase.ts](../src/auth/supabase.ts) — client singleton (현재 디렉토리 없음, 신규 생성)
- [ ] Email Magic Link (`signInWithOtp`) — Supabase 이메일 템플릿 한글화, redirect `https://barosit.com/auth/callback` (web) + `barosit://auth/callback` (desktop deep link)
- [ ] Google OAuth — Google Cloud Console 등록·redirect URI 동일 deep link
- [ ] Kakao OAuth — Supabase 가 native provider 미지원. "Sign in with OIDC" + Kakao Developers 앱 등록 + Kakao 약관 검수. redirect URI 두 가지 등록 필요
- [ ] Apple OAuth — Mac App Store 출시 시점에 (Apple Developer 계정 필요, 출시 블로커 #4 와 동시 진행)

### 1-3. 토큰 저장 (보안)
- [ ] Rust 의존성 `keyring = "..."` 추가 — OS 키체인 사용
- [ ] [src-tauri/src/lib.rs](../src-tauri/src/lib.rs) — `store_token` / `load_token` / `clear_token` 3개 명령
- [ ] [src/platform/types.ts](../src/platform/types.ts) — `secureStore` 인터페이스 추가, web 은 IndexedDB 또는 sessionStorage fallback (refresh token 은 web 에서 보호 어려움 — 토큰 lifetime 짧게)

### 1-4. UI
- [ ] [src/views/ProfileView.tsx](../src/views/ProfileView.tsx) 의 "준비 중" 버튼 → 실제 로그인/회원가입 모달 연결
- [ ] [src/views/AuthModal.tsx](../src/views/AuthModal.tsx) — 신규. 이메일·비밀번호 + Google 버튼
- [ ] 로그인 상태 표시 (헤더 아바타 옆 색상 점)

## Phase 2 — DB 스키마 + 동기화 엔진 (~3-5일)

### 2-1. 스키마 (Drizzle 또는 Supabase Studio 로 정의)

```sql
-- 사용자 프로필
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  avatar text,
  work_env text check (work_env in ('laptop', 'external_monitor', 'mixed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 자세 이벤트 (이력)
create table posture_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  device_id text not null,        -- 기기 식별자 (캘리브레이션 기준)
  posture_type text not null,
  duration_secs int not null,
  occurred_at timestamptz not null,
  created_at timestamptz default now()
);
create index on posture_events (user_id, occurred_at desc);

-- 점수 스냅샷 (일별)
create table daily_scores (
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  avg_score int,
  violation_count int,
  stretch_count int,
  primary key (user_id, date)
);

-- 사용자 설정 (임계값·민감도·휴식 알림 등)
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  thresholds jsonb,
  alert_modes jsonb,
  break_config jsonb,
  cumulative_load jsonb,
  variability jsonb,
  adaptive_sensitivity jsonb,
  updated_at timestamptz default now()
);
```

### 2-2. RLS 정책
- 모든 테이블 `enable row level security`
- 정책: `auth.uid() = user_id` 이어야 select/insert/update/delete 가능

### 2-3. 동기화 엔진 ([src/sync/](../src/sync/) 신규)
- [ ] `syncQueue.ts` — 오프라인 큐 (IndexedDB) + 온라인 시 일괄 flush
- [ ] `pushScore.ts` — 점수 변화 시 일별 스냅샷 upsert (1분 throttle)
- [ ] `pushEvent.ts` — 위반 이벤트 발사 시 즉시 push (오프라인 시 큐)
- [ ] `pushSettings.ts` — `*_CONFIG_CHANGED_EVENT` 수신 시 upsert
- [ ] `pullOnStart.ts` — 로그인 직후 서버 데이터 가져와 localStorage 와 병합 (충돌 해결: 최신 `updated_at` 우선)

### 2-4. UI 통합
- [ ] [src/hooks/useMonitoringEngine.ts](../src/hooks/useMonitoringEngine.ts) — 로그인 상태일 때 push 호출 추가
- [ ] [src/views/DashboardView.tsx](../src/views/DashboardView.tsx) — 로그인 시 서버 데이터 표시 옵션 ("전체 / 이 기기만")

## Phase 3 — 충돌 해결·오프라인·마이그레이션 (~2-3일)

### 3-1. 충돌 해결
- 이벤트(append-only): 단순 union, 중복은 `(user_id, device_id, occurred_at, posture_type)` 유니크 키
- 설정(last-write-wins): `updated_at` 비교

### 3-2. 오프라인
- 네트워크 끊김 감지 (`navigator.onLine` + heartbeat)
- 큐 IndexedDB 저장, 재연결 시 자동 flush
- 사용자에게 동기화 상태 표시 (헤더의 작은 cloud 아이콘)

### 3-3. 기존 데이터 마이그레이션
- [ ] 첫 로그인 시 "이 컴퓨터 데이터를 클라우드에 백업할까요?" 안내 모달
- [ ] 동의 시 [src/dataBackup.ts](../src/dataBackup.ts) 의 export 로직을 재활용해 일괄 upload

## Phase 4 — 법적 문서 재작성 + 변호사 검토 (~1-2일)

### 4-1. privacy.md 재작성
- 운영자가 보유하는 데이터 항목 표 신설 (Supabase 의 profiles·posture_events·daily_scores·user_settings)
- 보유 기간 (회원 탈퇴 시 즉시 삭제 / 마지막 활동 후 N개월 후 자동 삭제)
- 처리위탁 — Supabase (운영자: Supabase Inc., 데이터 리전: 서울)
- 해외 이전 안내 (Supabase 가 미국 본사이지만 데이터 자체는 서울 리전)
- 이용자 권리 — 열람/정정/삭제는 앱 안에서 직접, 추가로 운영자에게 이메일 요청 가능
- 14세 미만 — 가입 차단 또는 보호자 동의 절차

### 4-2. terms.md 추가
- 계정 가입·해지 조항
- 비밀번호·보안 책임 (이용자)
- 서비스 중단·계정 종료 시 데이터 처리 (90일 유예 후 영구 삭제 등)

### 4-3. 변호사 검토
- [ ] 한국 변호사 검토 의뢰 (개인정보보호법 + 통신비밀보호법)
- [ ] EU 거주자 대상이라면 GDPR DPO 지정 검토 (대량 처리 또는 민감 정보 처리 시 의무)

## 운영 비용 (예상)

| 서비스 | 무료 한도 | BaroSit 예상 (1000 MAU 가정) | 유료 시작 |
|---|---|---|---|
| Supabase | 500MB DB · 50K MAU · 2GB 전송 | 매우 여유 | $25/월 부터 |
| Google OAuth | 무료 | 무료 | — |
| Apple OAuth | $99/년 (Developer 계정) | 출시 블로커 #4 와 합산 | — |
| 도메인 (인증 redirect) | 별도 | $10-15/년 | — |

초기 운영은 사실상 무료. 5000 MAU 부근에서 Supabase Pro 유료 전환 고려.

## 일정 (영업일 기준)

```
Phase 0: ✅ 2026-05-19 (이번 세션)
Phase 1: 2-3일
Phase 2: 3-5일
Phase 3: 2-3일
Phase 4: 1-2일
─────────────
합계: 8-13일 (≈ 2-3주)
```

이 작업은 macOS 코드 서명·공증(출시 블로커 #4)·랜딩 페이지 등과 직렬 처리하는
것이 안전합니다. 즉, **출시 직전이 아니라 출시 후 v0.2 또는 v0.3 메이저
업데이트로 배포** 하는 흐름이 권장됩니다.

## 다음 단계

위 사전 결정 사항 6개에 대해 사용자 의견 → 본 계획서 보정 → Phase 1 착수.

---

**작성일**: 2026-05-19
**최종 갱신**: 2026-05-20 (사전 결정 사항 확정 — Cloudflare Pages 호스팅 + Supabase + 매직링크/Google/Kakao)
**작성자**: BaroSit dev (Claude assist)
**버전**: v2 — Phase 1 착수 가능
