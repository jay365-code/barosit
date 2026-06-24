# BaroSit 서비스 오픈 준비 계획서 (Launch Readiness Plan)

> 작성일: 2026-06-04 (갱신: 2026-06-04) · 기준 버전: **v0.2.29** · 분석 방식: 문서 + 코드베이스 정밀 대조 (코드가 진실의 원천)
>
> ⚠️ 본 계획서는 **유료 SaaS(PRO 구독) 정식 오픈**을 목표로 하되, **무료 베타를 출시 전략으로 선택 가능**하게 한다(런치 모드 토글, §6.1). "유료 정식"이 완성 목표, "무료 베타"는 그동안 사용자를 받는 경로.
>
> **외부 의존 진행 상황**: 🟡 Toss Payments 가맹점 **심사 중** · ✅ Apple Developer Program **등록 완료 및 코드서명/공증 활성화**. 리드타임이 도는 동안 결제 백엔드(P0-1)·PCI(P0-4)·런치 토글(§6.1)을 구현 완료하고 macOS 서명(P0-2)까지 완전 완료하여 이제 남은 건 결제 배포/심사뿐.

---

## 0. 한 줄 결론

**P0 블로커 3개 중 macOS 서명이 완료되었으며, 실결제 백엔드·PCI는 코드 구현 완료, 남은 건 "배포/심사" 운영 단계뿐.**
범례: **✅ 완료(검증)** · **🟢 코드 구현 완료(배포·실행 검증 대기)** · **⏳ 외부 의존 진행 중** · **⬜ 미착수**

- 🟢 **실결제 백엔드 (P0-1)** — Edge Functions 5종 + 마이그레이션 + 프론트 결선 **구현 완료**. mock 전부 제거. 남은 건 `supabase functions deploy` + 시크릿/pg_cron/웹훅 등록 + live key + E2E QA(배포 후).
- 🟢 **PCI 자체 카드폼 (P0-4)** — ProfileView raw 카드 수집 위저드 **완전 제거** → 웹 Toss 결제창 위임 완료.
- ✅ **macOS 코드서명·공증 (P0-2)** — Apple Developer ID 발급 완료 및 CI/CD 워크플로우(`release.yml`) 내 `APPLE_*` Secrets 연동 완료. `.app`과 `.dmg` 모두 공증 및 스테이플 처리되어 Gatekeeper acceptance 확인.
- ✅ **런치 모드 토글 (§6.1)** — 베타↔유료 전환 **구현 완료·브라우저 검증**.

→ **무료 베타 출시의 블로커(macOS 서명)는 완전히 해결됨.** 유료 정식은 P0-1 **배포 4단계**(§7) + Toss 심사(⏳) 완료가 남음.

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

### 🟢 이번에 구현 완료 (코드 — 배포/실행 검증 대기)
| 영역 | 상태 | 근거 |
|---|---|---|
| 실결제 백엔드 (Toss Edge Functions 5종) | 🟢 구현 | `supabase/functions/{billing-issue,payment-cancel,subscription-manage,toss-webhook,charge-renewals}` |
| 결제 성공 처리 → 서버검증 | 🟢 구현 (mock 제거) | `PricingView.tsx`·`Marketing.tsx` → `billing-issue` invoke |
| 환불/해지/복구/카드변경 → Edge Function | 🟢 구현 | `payment-cancel`·`subscription-manage` invoke |
| 정기청구/더닝/웹훅 | 🟢 구현 | `charge-renewals`·`toss-webhook` (스케줄 등록은 배포 단계) |
| 자체 카드 입력폼 (PCI) | 🟢 제거 완료 | `ProfileView` 위저드 삭제 → `platform.openBrowser` 웹 결제창 |
| 권한 부여 서버 신뢰 이전 | 🟢 구현 | 트리거 service_role 허용 (`mig 20260521000010`) |
| 런치 모드 토글 (베타↔유료) | ✅ 구현·검증 | `src/launchMode.ts` + AdminDashboard |

### 🔴 남은 블로커 (미구현/미설정)
| 영역 | 상태 | 근거 |
|---|---|---|
| **macOS 코드서명·공증** | 🟡 주석 준비 / ⏳ 인증서 대기 | `release.yml`에 APPLE_* **주석 블록** — 승인 후 Secrets 6개 + 주석 해제 (빈 값이면 codesign 실패) |
| **릴리스 공개** | 🔴 draft 유지 | 서명 검증 후 `releaseDraft:false` 한 줄 (미서명 자동공개 방지차 현재 유지) |
| **Windows 코드서명** | 🔴 미설정 | SmartScreen 경고 발생 |
| **결제 백엔드 배포** | ⬜ 미배포 | functions deploy + `TOSS_SECRET_KEY` + pg_cron + 웹훅 등록 + live key (Toss 심사 ⏳) |

### 📋 비(非)결제 항목 구현 현황 (한눈에)

"결제 빼고 다 됐나?"에 대한 답 — **핵심 기능은 됐지만, 서명·품질 항목은 남음.**

| 항목 | 상태 | 비고 |
|---|---|---|
| 자세 감지 엔진 / 온보딩 | ✅ 완성 | |
| 인증 (Google·Kakao·Apple + 데스크톱 deep-link) | ✅ 완성 | |
| 클라우드 동기화 / RLS / 관리자 대시보드 | ✅ 완성 | |
| 법무 문서(사업자 실값) / i18n ko·en·ja / 마케팅 사이트 | ✅ 완성 | |
| 자동 업데이트 인프라 | ✅ 완성·검증 | |
| 런치 모드 토글 (베타↔유료) | ✅ 완성·검증 | 이번 세션 |
| **macOS 코드서명·공증 (P0-2)** | ✅ **완료** | release.yml에 Secrets 연동 및 v0.3.6+ 배포 자동화 완료, Gatekeeper acceptance 검증 |
| **Windows 코드서명** | 🔴 미설정 | SmartScreen 경고 |
| Windows 실기 검증 | ⬜ 미진행 | 실제 윈도우 기기 필요 |
| 프로덕션 시크릿 점검 / 웹배포 자동화 확인 | 🟡 부분 | 배포 시 확인 |
| 약관 변호사 검토 | ⬜ 미진행 | 외부 (결제 조항) |
| 크래시 리포트 / 텔레메트리 | 🔴 미구현 | Sentry 등 없음 |
| 자동화 테스트 | 🔴 0개 | 결제 경로 통합테스트 권장 |
| 데모 GIF/스크린샷 | ⬜ 미진행 | 랜딩 전환율 |

> **결론: macOS 서명 및 공증이 완료되었으므로 베타 출시 준비는 완료되었습니다.** 나머지(Windows 서명·테스트·크래시리포트)는 출시 후 개선 가능합니다. 유료 정식 출시를 위해서는 결제 백엔드 배포 및 Toss 심사 완료가 남았습니다.

---

## 2. 🔴 P0 블로커 — 이게 없으면 오픈 불가

### P0-1. 실결제 시스템 (Toss Payments) 구축 — 🟢 코드 구현 완료 / ⬜ 배포 대기

**구현 완료 (코드 — `deno task check` 5종 통과 ✅ 2026-06-04)**:
- [x] Supabase Edge Functions — `billing-issue`(빌링키 발급+첫청구+PRO활성, `mode:update_card` 포함), `payment-cancel`(7일+미사용 환불), `subscription-manage`(해지/복구), `toss-webhook`(S2S 교차검증+멱등), `charge-renewals`(정기청구+더닝) + `_shared`
- [x] 원커맨드 배포 스크립트 `supabase/deploy-payments.sh` (테스트키로 전체 배포 가능)
- [x] 프론트 결제 성공 핸들러 재작성 — mock 직접 upsert 제거, `billing-issue` 응답으로만 PRO 활성화 (`PricingView`·`Marketing`)
- [x] 환불/해지/복구/카드변경 → 실제 Edge Function 호출 연결 (`Marketing`·`ProfileView`)
- [x] 마이그레이션 `20260521000010` — 트리거 service_role 허용 + `customer_key`/`billing_cycle`/멱등 인덱스, `20260521000009` — `app_config`

**남은 작업 (배포·운영, 코드 아님)**:
- [ ] `supabase functions deploy` 5종 + `supabase secrets set TOSS_SECRET_KEY`
- [ ] pg_cron / net extension 활성화 + `charge-renewals` 스케줄 등록
- [ ] Toss 개발자센터 웹훅 URL 등록
- [ ] `test_ck_...` → **live key 전환** (Toss 심사 완료 후, `VITE_TOSS_CLIENT_KEY` env)
- [ ] 실카드 결제→환불→정기청구 E2E QA

**외부 의존**: ⏳ **Toss Payments 가맹점 심사 중** → live key. · Supabase Pro 대시보드에서 pg_cron/net 활성화.

> 임계경로는 구현이 아니라 **Toss 심사 리드타임 + 배포 후 실결제 QA**. 배포 절차는 [supabase/functions/README.md](../supabase/functions/README.md) 참고.

### P0-2. macOS 코드서명 + 공증 (Notarization)

**현 상태**: 빌드는 되지만 서명이 없어 사용자가 다운로드 시 "확인되지 않은 개발자" + Gatekeeper로 **실행 자체 불가**. (`release.yml:60`의 `TAURI_SIGNING_*`은 자동업데이트용 minisign 키일 뿐, Apple 인증서가 아님)

**진행 상황**:
- [x] **`release.yml`에 APPLE_* env 주석 블록 준비** — 승인 후 주석만 해제하면 됨. ⚠️ tauri 는 `APPLE_CERTIFICATE` 가 빈 값이어도 서명을 시도하다 `security import` 실패 → 인증서 없는 동안엔 **반드시 주석 유지**(unsigned 빌드 통과). (v0.3.0 1차 빌드가 이 함정으로 실패 → 주석 처리로 수정)
- [⏳] Apple Developer Program **신청 완료** (승인 대기)

**남은 작업 (Apple 승인 후)**:
1. "Developer ID Application" 인증서 발급 → `.p12` base64 + 앱 암호 → GitHub Secrets 6개 등록
2. `release.yml`의 APPLE_* **주석 6줄 해제**
3. **`releaseDraft: true` → `false`** (서명 검증 후) — 안 하면 다운로드 URL 404
4. 서명·공증된 dmg를 다른 Mac에서 다운로드→실행 검증

### P0-3. (보안) 구독 권한 부여를 서버 신뢰로 이전 — 🟢 구현 완료

- [x] `prevent_subscription_tampering` 트리거를 보정해 **어드민 또는 service_role(Edge Function)만** `plan_id`/`status` 변경 가능 (`mig 20260521000010`). 일반 사용자/익명은 차단.
- [x] PRO 활성화·해지·환불·복구가 모두 결제 검증을 거친 service-role Edge Function 경유로 일원화 (`?payment=success` 쿼리 신뢰 제거).

### P0-4. 자체 카드 입력폼 제거 (PCI-DSS) + 결제 경로 통일 — 🟢 구현 완료

원래 문제: ProfileView 자체 인앱 위저드가 raw 카드번호·유효기간·비밀번호·생년월일을 직접 수집(PCI-DSS 위반 소지).

- [x] ProfileView 자체 카드 입력 위저드 **완전 제거** (입력폼·Luhn·가상카드 플레이트·시뮬레이션 핸들러 일체 삭제)
- [x] 카드 등록/변경 단일화 — 데스크톱 ProfileView 는 `platform.openBrowser`로 웹 Toss 호스티드 결제창 위임, 마케팅 카드변경은 `billing-issue` (`mode:update_card`) 경유
- [x] `card_info`는 백엔드(`billing-issue`)가 Toss 응답의 마스킹 카드정보만 저장 (프론트는 표시만)

> 무료 베타에서는 결제 섹션 자체가 비노출(§6.1)되며, 유료 전환 시에도 raw 카드 수집 경로가 더는 없음.

---

## 2.5. 결제정보 관리 기능 (구현 후 상태)

화면·흐름은 완비됐고, 이번 P0-1 작업으로 **각 기능이 실 백엔드(Edge Function)에 결선**됨. "현재" 열은 구현 후 상태, "남은 일"은 배포 후 검증 항목.

| 기능 | 화면 | 현재 (구현 후) | 남은 일 |
|---|---|---|---|
| 구독 상태 (플랜·상태·다음결제일·유예) | ✅ | ✅ DB 실값 | — |
| 등록 카드 표시 | ✅ | 🟢 `billing-issue`가 Toss 마스킹 카드정보 저장 | 배포 후 실데이터 확인 |
| 결제수단 등록 (가격페이지) | ✅ Toss SDK | 🟢 `billing-issue`로 빌링키 발급+첫청구 | 실카드 QA |
| 결제수단 등록 (프로필 자체폼) | — | 🟢 **제거됨** → 웹 결제창 위임 | — |
| 결제수단 변경 | ✅ | 🟢 `billing-issue` `mode:update_card` | 실카드 QA |
| 결제수단 삭제 | ✅ | 🟡 DB null (빌링키 폐기 API는 미연결) | Toss 빌링키 폐기 연결(선택) |
| 결제 내역 | ✅ | 🟢 실결제 원장 적재 (`billing_history`) | 배포 후 확인 |
| 환불 요청 | ✅ | 🟢 `payment-cancel`(7일·미사용 재검증+실취소) | 실카드 QA |
| 환불가능 판정 (7일+미사용) | ✅ | ✅ 서버에서 events/scores 실판정 | — |
| 구독 해지/복구 | ✅ | 🟢 `subscription-manage` | — |
| 현금영수증 | ❌ | ❌ 컬럼만(false 고정) | 신규 (선택) |

---

## 3. 🟠 P1 블로커 — 오픈 품질/신뢰

| # | 항목 | 현 상태 | 작업 |
|---|---|---|---|
| P1-1 | Windows 코드서명 | 미설정 → SmartScreen 경고 | 코드서명 인증서(OV/EV) 구매 후 `release.yml`에 서명 env 추가. (예산 제약 시 P2로 연기 가능) |
| P1-2 | Windows 실기 검증 | 미진행 | 실제 Windows에서 빌드 산출물 설치·트레이·카메라권한·알림 검증 |
| P1-3 | 프로덕션 시크릿 체크리스트 | 🟢 문서화 완료 | [docs/deployment-checklist.md](./deployment-checklist.md) — 위치별 시크릿·배포순서·검증. 실제 등록은 배포 시 |
| P1-4 | 웹 배포 자동화 확인 | Cloudflare Pages Git 연동(추정) | `barosit.com` 자동 배포가 실제 동작하는지 확인 (ops) |
| P1-5 | 환불 가능 여부 판정 로직 | 🟢 구현 완료 | `payment-cancel` Edge Function 이 7일+모니터링 0건(posture_events/daily_scores)을 **서버에서 재검증** |
| P1-6 | 결제 실패/엣지 UX | 🟡 부분 | 실패 시 `setPaymentState`/alert + admin_notifications 연동됨. 카드 거절·중복결제 세부 메시지는 배포 후 폴리시 |

---

## 4. 🟡 P2 — 출시 후 빠르게 / 운영 안정성

- **약관 변호사 검토** (결제·구독·환불 조항 — 전자상거래법 준수 최종 확인). 사업자 정보·환불정책은 이미 작성됨.
- **크래시 리포트 / 익명 텔레메트리** (옵트인) — 현재 없음. 초기 사용자 이슈 추적 곤란. (서비스 선택+옵트인 설계 필요 → 출시 후)
- **자동화 테스트** — 🟢 vitest 도입 + `resolveEffectivePlan` 단위테스트 10건(`src/launchMode.test.ts`, `npm run test`). 결제 Edge Function 통합테스트는 배포 환경 필요 → 추후.
- [x] **project-status.md 갱신** — v0.2.29 + 결제 백엔드·런치 토글 반영 완료 (2026-06-04).
- [x] **`build-windows.yml` 정리** — 확인 결과 `.github/workflows/`에 `release.yml` 단일. 잔재 없음.
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

### 6.1. 런치 모드 토글 (베타 ↔ 유료) — ✅ 구현 완료·브라우저 검증

옵션 A↔B 전환을 코드 한 지점으로 제어하는 **런치 모드 플래그**. 결정: **하이브리드 방식 + 베타 사용자 grandfather 안 함**. (`src/launchMode.ts` + AdminDashboard 시스템탭 토글)

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

**런치 모드 토글 (§6.1) — 베타 선출시 기반 — ✅ 구현 완료**
- [x] `src/launchMode.ts` + `app_config` 마이그레이션(`20260521000009`)
- [x] plan 판정 6곳 → `resolveEffectivePlan()` 중앙화
- [x] 페이월/다운로드/프로필 결제섹션 게이팅 + AdminDashboard 토글
- [x] `.env.example` `VITE_LAUNCH_MODE` + i18n 베타 배너/CTA (ko·en·ja)

**P0-4 PCI — 유료 전환 전 선행**
- [x] ProfileView 자체 카드 입력 위저드 제거 (raw 카드 수집 코드 삭제, `platform.openBrowser` 웹 결제창 안내로 대체)
- [x] 카드 등록/변경 → Toss `requestBillingAuth` 단일 경로 통일 (update_card 는 `billing-issue` 경유)

**P0-2 macOS 실행 가능화 — ✅ 완료**
- [x] `release.yml`에 Apple 서명·공증 env 주석 해제 및 GitHub Secrets 연동 완료
- [x] 빌드 및 공증 자동화 연동 (`releaseDraft: false`로 설정하여 자동 공개)
- [x] 다른 Mac에서 다운로드 후 실행하여 Gatekeeper 및 공증 검증 완료 (v0.3.6+ 에서 `.app` 및 `.dmg` 공증 및 스테이플 처리 확인)

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
- [ ] 약관 결제 조항 최종 검토 (외부)
- [x] project-status.md 갱신 (2026-06-04)
- [x] 다운로드 링크 ↔ 릴리스 자산명 일치 확인 — `BaroSit_<ver>_universal.dmg`/`_x64-setup.exe` 코드 일치 확인됨
