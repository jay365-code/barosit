# BaroSit 서비스 오픈 준비 계획서 (Launch Readiness Plan)

> 작성일: 2026-06-04 (갱신: 2026-06-04) · 기준 버전: **v0.2.29** · 분석 방식: 문서 + 코드베이스 정밀 대조 (코드가 진실의 원천)
>
> ⚠️ 본 계획서는 **유료 SaaS(PRO 구독) 정식 오픈**을 목표로 하되, **무료 베타를 출시 전략으로 선택 가능**하게 한다(런치 모드 토글, §6.1). "유료 정식"이 완성 목표, "무료 베타"는 그동안 사용자를 받는 경로.
>
> **외부 의존 진행 상황 (2026-06-04 기준)**: 🟡 Toss Payments 가맹점 **심사 중** · 🟡 Apple Developer Program **신청 완료**. 두 리드타임이 도는 동안 결제 백엔드(P0-1)와 런치 토글(§6.1)을 구현하는 것이 임계경로 활용.

---

## 0. 한 줄 결론

**기능(자세 감지·인증·동기화·관리자·법무·다국어·마케팅)은 거의 완성됐지만, "돈을 받는 길"과 "앱을 실행시키는 길" 두 축이 비어 있어 현 상태로는 유료 오픈 불가.**
- 🔴 **실결제 백엔드 전무** — 프론트는 결제 UI만 있고 실제 과금/빌링키 발급/정기청구/환불이 동작하지 않음 (전부 mock). 결제정보 관리 화면은 풍부하나 다루는 빌링키·카드정보·이력이 전부 가짜 (§2.5).
- 🔴 **macOS 코드서명·공증 미설정** — 사용자가 다운로드해도 Gatekeeper에 막혀 실행 불가. 릴리스는 draft로 생성되어 다운로드 링크 404.
- 🔴 **PCI 컴플라이언스 리스크** — ProfileView에 raw 카드번호를 자체 폼으로 수집하는 위저드가 있음 (현재 시뮬레이션). 정식 결제 전 **반드시 제거**하고 Toss 호스티드 SDK 단일 경로로 통일해야 함 (§2.4).

이 셋이 P0. 나머지는 품질/운영 이슈다. 단, **무료 베타로 먼저 띄우면** P0-1(결제)·P0-4(PCI)는 베타 단계에서 비활성화되므로, 당장의 베타 출시 블로커는 **P0-2(macOS 서명)** 뿐이다.

---

## 1. 현재 상태 한눈에 (검증 완료)

### ✅ 이미 된 것 (출시 가능 수준)
| 영역 | 상태 | 근거 |
|---|---|---|
| 자세 감지 엔진 (6종+스트레칭7종+점수+장시간보호) | 완성 | `src/pose/*`, project-status.md |
| 웹 Google/Kakao/Apple OAuth | 완성 | `src/auth/useAuth.ts:125-446` |
| 데스크탑(Tauri) deep-link OAuth (PKCE+방어로직) | 완성 | `src/auth/useAuth.ts:132-383` |
| 클라우드 동기화 엔진 (events/scores/settings/profile, FREE/PRO 차등) | 완성 | `src/lib/syncService.ts` |
| DB 스키마 + RLS + 변조방지 트리거 | 완성 | `supabase/migrations/2026052100000{0..8}` |
| 관리자 대시보드 (사용자·Q&A·구독·알림·릴리스) | 완성 | `src/views/AdminDashboardView.tsx` |
| 법무 문서 + **사업자 정보 실값** (주식회사 구비드/512-88-00059 등) | 완성 | `src/lib/legal.ts:6-16`, `docs/terms.md` |
| 다국어 ko/en/ja | 완성 (하드코딩 없음) | `src/i18n/locales/*` |
| 마케팅 사이트 라우트 (랜딩/가격/로그인/프로필/법무/커뮤니티/다운로드) | 완성 | `src/web/Marketing.tsx` |
| 자동 업데이트 인프라 (updater+minisign+CI) | 완성·검증됨 | `tauri.conf.json:84-90`, `release.yml` |
| 가격 일관성 (월4,900/연36,000) | 일치 | pricing-policy ↔ 코드 ↔ i18n |

### ❌ 비어 있는 것 (블로커)
| 영역 | 상태 | 근거 |
|---|---|---|
| **실결제 백엔드 (Toss Edge Functions)** | **미구현** | `supabase/functions/`에 `send-inquiry-email`만 존재 |
| **결제 성공 처리 = mock** | mock | `PricingView.tsx:156-245` (authKey 없으면 `mock_billing_key`, 쿼리만 믿고 PRO 부여) |
| **환불/해지 = DB만 변경** | mock | Toss `/payments/{key}/cancel` 미호출 — 실제 카드 취소 안 됨 |
| **자체 카드 입력폼 (PCI 위반 소지)** | mock·제거대상 | `ProfileView.tsx:436-449` raw 카드번호 직접수집 + 빌링키 발급 시뮬레이션 |
| **정기청구/더닝/웹훅** | 미구현 | pg_cron·webhook 수신 Edge Function 없음 |
| **macOS 코드서명·공증** | 미설정 | `tauri.conf.json` signingIdentity 없음, `release.yml`에 APPLE_* 없음 |
| **Windows 코드서명** | 미설정 | SmartScreen 경고 발생 |
| **릴리스 공개** | draft 생성 | `release.yml:68` `releaseDraft: true` → 다운로드 링크 404 |

---

## 2. 🔴 P0 블로커 — 이게 없으면 오픈 불가

### P0-1. 실결제 시스템 (Toss Payments) 구축

**현 상태**: 프론트는 `requestBillingAuth`까지 호출하지만, 성공 리다이렉트 후 **백엔드 검증 없이 클라이언트가 직접** `user_subscriptions`에 `plan_id='pro'`를 쓴다. 실제 빌링키 발급·과금·정기청구·환불이 전부 없다 → **돈이 안 들어오고**, 결제 우회 위험까지 있다.

**필요 작업** (사양은 `docs/payment-integration-spec.md`에 이미 설계됨):
1. Supabase Edge Functions 신규 개발
   - `billing/issue` — authKey+customerKey → Toss `/v1/billing/authorizations/issue`로 빌링키 발급 + `user_subscriptions` 저장
   - `billing/charge` — 빌링키로 1차/정기 실청구 + `billing_history` 적재
   - `payment/cancel` — JWT 검증 → Toss `/v1/payments/{key}/cancel` → DB 강등 (실제 환불)
   - `webhook/toss` — `PAYMENT_STATUS_CHANGED`/`BILLING_KEY_ISSUED` 수신, 서명/S2S 교차검증(`src/lib/billingVerify.ts` 재활용), 멱등성(order_id/payment_key unique)
   - `cron/charge-renewals` — pg_cron 매일 03:00, 만기 구독 청구 + 더닝(7일 유예 → free 강등)
2. **프론트 결제 성공 핸들러 재작성** — mock 직접 upsert 제거, Edge Function 응답으로만 PRO 활성화 (`PricingView.tsx:156-245`)
3. 환불/해지 버튼을 실제 Edge Function 호출로 연결 (`Marketing.tsx`/`ProfileView.tsx`)
4. `test_ck_...` 하드코딩 제거 → env 분리, **live key 전환** (`PricingView.tsx`, `Marketing.tsx:3599`)
5. Supabase prod에 `TOSS_SECRET_KEY` 시크릿 등록

**외부 의존 (리드타임 있음, 먼저 착수)**:
- 🔑 **Toss Payments 가맹점 실계약 + 심사** → live API 키 발급. 사업자등록증·정산계좌 필요. (영업일 단위 소요)
- pg_cron / net extension 활성화 (Supabase Pro 대시보드)

> 코드 규모: Edge Function 5종 + 프론트 결선 재작업. 사양서가 상세해 구현 난이도보다 **Toss 심사 리드타임 + 실결제 QA**가 임계경로.

### P0-2. macOS 코드서명 + 공증 (Notarization)

**현 상태**: 빌드는 되지만 서명이 없어 사용자가 다운로드 시 "확인되지 않은 개발자" + Gatekeeper로 **실행 자체 불가**. (`release.yml:60`의 `TAURI_SIGNING_*`은 자동업데이트용 minisign 키일 뿐, Apple 인증서가 아님)

**필요 작업**:
1. **Apple Developer Program 가입** ($99/년) — 외부 의존, 먼저 착수
2. "Developer ID Application" 인증서 발급 → base64로 GitHub Secrets 등록
3. `release.yml`에 서명/공증 env 추가: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`(앱 암호), `APPLE_TEAM_ID` (tauri-action이 자동 서명·공증·staple 수행)
4. `tauri.conf.json` `bundle.macOS`에 서명 식별자 연동 확인
5. **`releaseDraft: true` → `false`** 또는 배포 절차에 "draft publish" 단계 명시 (`release.yml:68`). 안 하면 다운로드 URL 404.
6. 서명·공증된 dmg를 실제 다른 Mac에서 다운로드→실행 검증

### P0-3. (보안) 구독 권한 부여를 서버 신뢰로 이전

P0-1에 포함되지만 별도 강조: 현재 PRO 활성화가 클라이언트 신뢰 기반(`?payment=success` 쿼리). `prevent_subscription_tampering` 트리거가 일부 막지만, **결제 검증을 통과한 Edge Function(service role)만이 `plan_id='pro'`를 쓰도록** 경로를 일원화해야 한다.

### P0-4. 자체 카드 입력폼 제거 (PCI-DSS) + 결제 경로 통일

**현 상태**: 결제수단 등록 경로가 **둘로 갈려** 있다.
- 가격페이지/마케팅: Toss SDK `requestBillingAuth` (호스티드 — 카드번호가 우리 코드에 닿지 않음. 올바른 방식)
- **ProfileView 자체 인앱 위저드** (`ProfileView.tsx:368-479`): **raw 카드번호·유효기간·비밀번호 앞2자리·생년월일을 직접 수집** + Luhn 검증 + `setTimeout(1500)`으로 빌링키 발급을 **시뮬레이션**(`dummy_billing_key`).

**문제**: 자체 폼으로 raw 카드 데이터를 받는 것은 **PCI-DSS 위반 소지**가 크다 (SAQ 범위 폭증·법적 책임). 정식 결제에서는 절대 불가.

**필요 작업**:
1. ProfileView 자체 카드 입력 위저드 **완전 제거** (입력폼·Luhn·가상카드 플레이트·시뮬레이션 핸들러 일체)
2. 카드 등록/변경은 **Toss `requestBillingAuth` 단일 경로**로 통일 (ProfileView "결제수단 변경"도 SDK 리다이렉트로)
3. `card_info`는 **백엔드(billing/issue)가 Toss 응답에서 받은 마스킹 카드정보만** 저장 (프론트는 표시만)

> 무료 베타에서는 결제 섹션 자체가 비노출(§6.1)되므로 자연히 회피되지만, **유료 전환 전 반드시 선행**되어야 한다.

---

## 2.5. 결제정보 관리 기능 실태 (화면은 풍부 / 실속은 mock)

사용자용 결제정보 관리 **화면·흐름은 거의 완비**되어 있으나, 다루는 데이터가 전부 가짜다. 정식 오픈 시 각 항목을 실 백엔드(P0-1)에 결선해야 한다.

| 기능 | 화면 | 실제 동작 | 정식오픈 필요작업 |
|---|---|---|---|
| 구독 상태 (플랜·상태·다음결제일·유예) | ✅ `ProfileView.tsx:174-189` | ✅ DB 실값 | 유지 |
| 등록 카드 표시 | ✅ | 🟡 값이 가짜 | 실 카드정보 연동 |
| 결제수단 등록 (가격페이지) | ✅ Toss SDK | 🔴 authKey를 billing_key로 직접 저장 | `billing/issue` 교환 연결 |
| 결제수단 등록 (프로필 자체폼) | ✅ | 🔴 시뮬레이션 (P0-4) | **제거** |
| 결제수단 변경 | ✅ `Marketing.tsx:4603` | 🔴 authKey만 갱신 | SDK+`issue` 연결 |
| 결제수단 삭제 | ✅ `ProfileView.tsx:482` | 🟡 DB만 null, 빌링키 폐기 X | 빌링키 폐기 API |
| 결제 내역 | ✅ `Marketing.tsx:4530` | 🟡 mock 이력 | 실결제 이력 |
| 환불 요청 | ✅ | 🔴 admin 알림 접수만 | `payment/cancel` 연결 |
| 환불가능 판정 (7일+미사용) | ✅ | ✅ events/scores로 실판정 | 양호 (서버 이관만) |
| 구독 해지/복구 | ✅ | 🟡 status만 변경 | 정기청구 구축 후 의미 |
| 현금영수증 | ❌ | ❌ 컬럼만(false 고정) | 신규 (선택) |

---

## 3. 🟠 P1 블로커 — 오픈 품질/신뢰

| # | 항목 | 현 상태 | 작업 |
|---|---|---|---|
| P1-1 | Windows 코드서명 | 미설정 → SmartScreen 경고 | 코드서명 인증서(OV/EV) 구매 후 `release.yml`에 서명 env 추가. (예산 제약 시 P2로 연기 가능) |
| P1-2 | Windows 실기 검증 | 미진행 | 실제 Windows에서 빌드 산출물 설치·트레이·카메라권한·알림 검증 |
| P1-3 | 프로덕션 시크릿 체크리스트 | 미흡 | Supabase prod에 Google/Kakao OAuth secret(현재 placeholder), TOSS_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY 등록 + 배포 전 점검 문서화 |
| P1-4 | 웹 배포 자동화 확인 | Cloudflare Pages Git 연동(추정) | `barosit.com` 자동 배포가 실제 동작하는지 확인. 미동작 시 Pages 연동 또는 배포 워크플로우 추가 |
| P1-5 | 환불 가능 여부 판정 로직 | 문서엔 "미사용=환불" 규정 | 7일 이내+모니터링 0분 판정을 서버에서 실제 검증 (pricing-policy §4.1) |
| P1-6 | 결제 실패/엣지 UX | 부분 | 카드 거절·중복결제·네트워크 단절 시 사용자 안내 + admin_notifications 연동 확인 |

---

## 4. 🟡 P2 — 출시 후 빠르게 / 운영 안정성

- **약관 변호사 검토** (결제·구독·환불 조항 — 전자상거래법 준수 최종 확인). 사업자 정보·환불정책은 이미 작성됨.
- **크래시 리포트 / 익명 텔레메트리** (옵트인) — 현재 없음. 초기 사용자 이슈 추적 곤란.
- **자동화 테스트** — 거의 없음. 최소한 결제 Edge Function/환불 경로는 통합테스트 권장.
- **project-status.md 갱신** — 문서가 v0.1.1 기준으로 stale (실제 v0.2.29). 결제·인증·동기화·관리자 완성 반영 필요.
- **`build-windows.yml` 중복 트리거 정리** — (이미 release.yml 단일화된 것으로 확인됨, 잔재 확인만)
- **데모 GIF/스크린샷** — 랜딩 전환율.
- QA 대기 항목 (project-status.md §"QA 대기" 4 Phase 알림 실검증).

---

## 5. 외부 의존 — 리드타임 있으니 "오늘" 시작할 것

| 항목 | 비용 | 리드타임 | 차단하는 것 |
|---|---|---|---|
| **Apple Developer Program** | $99/년 | 가입~승인 수일 | P0-2 (macOS 실행) |
| **Toss Payments 실계약·심사** | 정산수수료 | 영업일 단위 심사 | P0-1 (실결제 전체) |
| Windows 코드서명 인증서 | OV 연 수만~/EV 더 높음 | 발급 수일~수주(EV) | P1-1 |
| Supabase Pro (이미 사용 중) | $25/월 | - | pg_cron/동기화 |

---

## 6. 권장 출시 경로 (2안)

### 옵션 A — "무료 베타 선출시" (권장 / 빠름)
P0-1(결제) 없이도 가능. PRO를 잠시 "무료 베타"로 개방하거나 웹 FREE만 공개.
- 필요: **P0-2(서명·공증)** + 릴리스 publish + 다운로드 검증.
- 결제는 빠진 채로 실사용 피드백·안정성 확보. Toss 심사 진행하며 병행.
- 장점: Apple 가입+서명만 끝내면 수일 내 가능. 리스크 최소.

### 옵션 B — "유료 정식 오픈"
- 필요: **P0 전부 + P1 핵심(시크릿·웹배포·환불판정)**.
- 임계경로: Toss 심사 → Edge Function 구현 → 실결제 QA → 서명·공증.
- 결제 QA는 실제 카드로 1회 결제→환불→정기청구까지 돌려봐야 함.

> 추천: **A로 먼저 사용자 받고**, 결제 백엔드(P0-1)를 완성해 **B로 전환**. 그러면 "앱이 안 열린다"는 1차 리스크를 제거한 상태에서 과금을 붙일 수 있다.

### 6.1. 런치 모드 토글 (베타 ↔ 유료) — 옵션 A↔B 전환 수단

옵션 A↔B 전환을 코드 한 지점으로 제어하는 **런치 모드 플래그**. 결정: **하이브리드 방식 + 베타 사용자 grandfather 안 함**.

**플래그 해석 우선순위 (하이브리드)**:
```
원격값(Supabase app_config, 있으면) > localStorage 캐시 > VITE_LAUNCH_MODE(env) > 'paid'(안전 기본값)
```
- 빌드타임 env를 기본값으로, 원격값이 있으면 override → 관리자가 admin에서 **즉시 전환**(이미 설치된 데스크톱 앱 포함), 네트워크 실패 시 캐시/env로 **안전 폴백**.
- **grandfather 안 함**: 모드를 `paid`로 내리면 `resolveEffectivePlan`이 비구독자에게 자동으로 `free`를 돌려줘 일괄 강등 → 사용자별 코호트 플래그 불필요.

**설계 핵심 — plan 판정 중앙화**: 현재 `isPro` 판정이 5곳(App.tsx:399, Marketing ×3, ProfileView:180, PricingView:92)에 복붙됨. 이를 `resolveEffectivePlan(row)` 단일 함수로 모으고, 그 함수 안에서 `isBetaFree()`면 `'pro'` 반환 → **토글 분기가 코드 전체에 단 한 줄**.

**`isBetaFree()`일 때 UI 게이팅**:
- 가격페이지: "결제하기" → "무료로 시작", `🎉 베타 기간 전 기능 무료` 배너, `requestBillingAuth` 진입 차단
- 다운로드 CTA: free→pricing 리다이렉트 해제, 로그인만으로 다운로드 개방
- ProfileView 결제 섹션: 베타 안내로 대체 → **P0-4 PCI 자체폼도 자연 비노출**

**터치 범위**: 신규 `src/launchMode.ts` + `app_config` 마이그레이션 / 판정 5곳 치환 / UI 게이팅 3곳 / AdminDashboard 토글 / 부팅 훅(App·Marketing) / `.env.example` + i18n(ko·en·ja). 결제 백엔드와 **독립적**이라 P0-1 전에 먼저 머지 가능.

---

## 7. 실행 체크리스트

**즉시 (외부 의존 착수)**
- [x] Apple Developer Program 가입 신청 (신청 완료)
- [x] Toss Payments 가맹점 신청 + 사업자/정산계좌 제출 (심사 중)
- [ ] (예산 결정) Windows 코드서명 인증서 발주 여부

**런치 모드 토글 (§6.1) — 베타 선출시 기반**
- [ ] `src/launchMode.ts` + `app_config` 마이그레이션
- [ ] plan 판정 5곳 → `resolveEffectivePlan()` 중앙화
- [ ] 페이월/다운로드/프로필 결제섹션 게이팅 + AdminDashboard 토글
- [ ] `.env.example` `VITE_LAUNCH_MODE` + i18n 베타 배너/CTA

**P0-4 PCI — 유료 전환 전 선행**
- [x] ProfileView 자체 카드 입력 위저드 제거 (raw 카드 수집 코드 삭제, `platform.openBrowser` 웹 결제창 안내로 대체)
- [x] 카드 등록/변경 → Toss `requestBillingAuth` 단일 경로 통일 (update_card 는 `billing-issue` 경유)

**P0-2 macOS 실행 가능화**
- [ ] Developer ID 인증서 → GitHub Secrets 등록
- [ ] `release.yml`에 Apple 서명·공증 env 추가
- [ ] `releaseDraft: false` (또는 publish 단계화)
- [ ] 다른 Mac에서 다운로드→실행 검증

**P0-1 실결제** (코드 구현 완료 — 배포/심사 대기)
- [x] Edge Functions 구현 (`billing-issue`/`payment-cancel`/`subscription-manage`/`toss-webhook`/`charge-renewals` + `_shared`) · [README](../supabase/functions/README.md)
- [x] `PricingView`·`Marketing` 결제 성공 핸들러 → `billing-issue` 서버검증 경로로 재작성 (mock 제거)
- [x] 환불/해지/복구/카드변경 → Edge Function 호출로 연결
- [x] 트리거 보정(service_role 허용) + `customer_key`/`billing_cycle`/멱등 인덱스 마이그레이션 (`20260521000010`)
- [ ] **배포**: `supabase functions deploy` 5종 + `supabase secrets set TOSS_SECRET_KEY`
- [ ] pg_cron + net extension 활성화 + `charge-renewals` 스케줄 등록
- [ ] Toss 개발자센터에 웹훅 URL 등록
- [ ] live key 전환 (Toss 심사 완료 후)
- [ ] 실카드 결제→환불→정기청구 E2E QA

**P1**
- [ ] Supabase prod OAuth/Toss/Service 시크릿 등록·점검
- [ ] Windows 실기 검증
- [ ] `barosit.com` 자동 배포 동작 확인

**출시 직전**
- [ ] 약관 결제 조항 최종 검토
- [ ] project-status.md 갱신
- [ ] 다운로드 링크 ↔ 실제 릴리스 자산명 일치 확인 (`BaroSit_${version}_universal.dmg` 등)
