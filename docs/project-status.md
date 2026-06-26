# 프로젝트 현황 (Project Status)

> **이 문서의 목적**: 대화창이 바뀌어도 이 문서만 읽으면 어디까지 개발됐고 다음에 뭘 해야 할지 즉시 파악 가능하도록 유지. 큰 변경 후엔 이 문서도 함께 갱신.

## 빠른 요약

**BaroSit** — 데스크톱 자세 모니터링 앱 (Tauri 2 + React + MediaPipe)
**현재 버전**: v0.2.29 (package.json·tauri.conf·Cargo 일치)
**출시 준비 계획서**: [launch-readiness-plan.md](./launch-readiness-plan.md) ← 서비스 오픈 블로커/전략의 단일 출처
**완성도 추적(라이브)**: [service-completeness.html](./service-completeness.html) ← 영역별 done/partial/todo 단일 추적 문서 (에이전트 인계용)

**관측·측정 인프라 추가 (2026-06-26)** — 베타의 "사용자가 뭘 원하는지 모름"을 데이터로 전환:
- ✅ **OPS-1** 인앱 피드백(admin_notifications) + 클라이언트 에러 자동 리포트(`client_errors` + RPC, 프로덕션 배포) — 어드민 "사용자 피드백"/"오류 리포트" 탭
- ✅ **DATA-1** 로컬 `posture_events` 무음 유실 방지(파싱 손상 백업·부분복구, quota 보전, cap 5000→20000, 경고 배너)
- ✅ **SYNC-1** 클라우드 동기화 복원력(상태 가시화·지수 백오프 재시도·offline·청크 증분영속화로 중복 insert 수정)
- ✅ **UX-1** 캘리브레이션 실패 안내(build 예외 화면 + 부족한 적합성 항목 구체 안내)
- ✅ **MEASURE** 익명 사용 분석(`usage_events` + RPC, 프로덕션 배포) — 활성화 퍼널/재방문, 어드민 "사용 분석" 탭. 옵트아웃 토글
- ✅ **능동 피드백 넛지**(설치3일+·2세션+ 1회성) + privacy.md 익명 통계 명시
- 신규 단위테스트 다수(eventLog/syncStatus/calibration/usageAnalytics/feedbackNudge). 상세는 [changelog.md §0~0-6](./changelog.md)

**서비스 오픈 진행 (2026-06-04)**: 유료 SaaS 정식 오픈 목표 + 무료 베타를 출시 전략으로 토글 가능하게 준비 중.
- 🟡 외부 의존: Toss Payments 가맹점 **심사 중**, Apple Developer Program **신청 완료**
- ✅ **런치 모드 토글** 구현 — `src/launchMode.ts` 하이브리드 플래그(원격 `app_config` > 캐시 > `VITE_LAUNCH_MODE` env > `'paid'`), plan 판정 6곳 중앙화(`resolveEffectivePlan`), AdminDashboard 전환 토글. 베타면 페이월 숨김+전원 PRO 개방
- ✅ **결제 백엔드 P0-1** 구현 — Edge Functions 5종(`billing-issue`/`payment-cancel`/`subscription-manage`/`toss-webhook`/`charge-renewals`) + `_shared`, 마이그레이션 `20260521000009`(app_config)·`20260521000010`(트리거 service_role 허용+customer_key/billing_cycle/멱등), 프론트 결제/환불/해지/카드변경 전부 Edge Function 결선(mock 제거). [supabase/functions/README.md](../supabase/functions/README.md)
- ✅ **PCI** — ProfileView 자체 카드 입력 위저드(raw 카드 수집) 완전 제거 → 웹 Toss 호스티드 결제창 위임
- ⬜ 남은 블로커: 결제 백엔드 **배포**(functions deploy + TOSS_SECRET_KEY + pg_cron + 웹훅 + live key + E2E QA)

- ✅ macOS 핵심 기능 동작 (자세 6종 + 점수 + 스트레칭 7종 + 위젯 모드 + 장시간 사용성 보호)
- ✅ 웹 풀버전 1차 빌드 동작 (`npm run dev:web` / `npm run build:web`) — 백그라운드/위젯/트레이/LLM 제외
- ✅ **자동 업데이트** — `tauri-plugin-updater` + GitHub Releases + minisign 서명, v0.1.0 → v0.1.1 풀 시연 검증
- ✅ **첫 실행 온보딩** + **약관·처리방침 (초안)** + **사용자 프로필 Phase 0**
- ✅ **마케팅 사이트 라이브** — `https://barosit.com` (Cloudflare Pages, main push 시 자동 배포)
- ✅ **Google OAuth 인증** — Supabase + Custom Domain `auth.barosit.com`, consent screen 에 BaroSit 로고
- ✅ macOS 코드 서명·공증 완료 (v0.3.6+ 배포 자동화 및 Gatekeeper 통과 확인)
- 🟡 Windows 빌드 — release.yml 매트릭스로 빌드됨, 실 사용 검증은 미진행
- 🟡 일부 UX 다듬기 + 영문화 미진행 (※ i18n ko/en/ja 는 완료, 잔여는 미세 카피)
- ✅ **Kakao OAuth 동작** (QA 실증: `kauth.kakao.com` 302) — 과거 "검수 필요" 표기는 stale
- ✅ **데스크탑 deep-link OAuth(PKCE) + 클라우드 동기화** 구현됨(`src/auth/useAuth.ts`·`src/lib/syncService.ts`, profiles/posture_events/daily_scores/user_settings) — 과거 "미연결 ❌"는 stale (코드 기준 정정, DOC-1)
- ℹ️ **대시보드 주의**: 사용자용 대시보드는 MonitorView "상세 분석 리포트"(`detailedReportOpen`, 누적시간·평균·개선율·시간대추이·12개월그리드·히트맵 포함). `src/views/DashboardView.tsx` 는 **미사용(죽은 코드)** — 정리 대상

### 🔴 출시 블로커 진행 상황

| # | 항목 | 상태 |
|---|---|---|
| 1 | 첫 실행 온보딩 | ✅ 완료 |
| 2 | 자동 업데이트 | ✅ 완료 + 풀 시연 검증 |
| 3 | 프라이버시 정책 + 이용약관 | ✅ 사업자 실값(주식회사 구비드) + 인앱 모달 + 웹 라우트 (결제 조항 변호사 검토 권장) |
| 4 | macOS 코드 서명 + 공증 | ✅ 완료 — Developer ID 인증서 발급 및 `.app`과 `.dmg` 자동 공증/스테이플 완료 (v0.3.6+ 검증 완료) |
| 5 | 랜딩 페이지 + 도메인 | ✅ `barosit.com` 라이브 (Cloudflare Pages, 자동 배포) |
| 6 | 인증 (웹) | ✅ Google·Kakao·Apple OAuth + 데스크톱 deep-link |
| 7 | 결제 백엔드 (Toss) | 🟡 **코드 구현 완료** — 배포/심사/E2E QA 대기 ([계획서 P0-1](./launch-readiness-plan.md)) |
| 8 | 런치 모드 토글 (베타↔유료) | ✅ 구현 완료 (`src/launchMode.ts` + AdminDashboard) |

## 핵심 문서 (먼저 읽기)

| 문서 | 내용 |
|---|---|
| [기획안.md](./기획안.md) | 앱 전체 기획 — 현재 구현 기준 |
| [architecture.md](./architecture.md) | 윈도우·모드·검출 owner 구조 |
| [detection-algorithm.md](./detection-algorithm.md) | 자세 감지·점수 알고리즘 디테일 |
| [ui-modes.md](./ui-modes.md) | UX 흐름 (메인/위젯 모드) |
| [settings.md](./settings.md) | 사용자 설정 + localStorage 키 표 |
| [ipc-reference.md](./ipc-reference.md) | Tauri 명령·이벤트·CustomEvent |
| [development.md](./development.md) | dev/build, 디버깅, 폴더 구조 |
| [changelog.md](./changelog.md) | 세션 변경 이력 카테고리별 요약 |
| [privacy.md](./privacy.md) · [terms.md](./terms.md) | 개인정보 처리방침·이용약관 (초안) |
| [auth-sync-plan.md](./auth-sync-plan.md) | 인증 + 클라우드 동기화 Phase 1~4 계획 (사용자 검토 대기) |

## 개발 완료 항목

### 자세 감지 파이프라인
- [x] MediaPipe 4모델 통합 (Pose + Face + Hand + Image Segmenter)
- [x] 256×192 카메라 해상도 + 15 FPS
- [x] LandmarkSmoother (7프레임 이동평균)
- [x] visibility ≥ 0.7 필터
- [x] setTimeout-recursive 검출 루프 (백프레셔 방지)
- [x] 마스크 버퍼 재사용 (GC 부담 0)
- [x] 카메라 자동 재시작 + visibility change 대응

### 자세 6종 판정 (자세 위반 카테고리)
- [x] 거북목 (face pitch + headSize + z + drop 4신호 합산)
- [x] 턱 괴임 (pose + hand fingertip 결합)
- [x] 어깨 기울임 (baseline 대비 delta · 절댓값)
- [x] 등 구부정 (어깨 너비 + 어깨 y drop)
- [x] 모니터 거리 과근접 (-zDelta + 귀 너비 비율 확대)
- [x] 어깨 비대칭 (부호 있는 tilt + 어깨 중점 대비 코 x 오프셋 변화)

### 스트레칭 7종 (보너스)
- [x] 기지개 overhead (+5) — 팔꿈치 어깨 위 sw*0.20 + 손목/팔꿈치 코보다 위
- [x] 목 풀기 behind_head (+5) — 팔꿈치 외측+위 + 손목 귀 근접/가려짐
- [x] 어깨 스트레치 cross_body (+4) — wrist가 어깨 중점 너머 + 동측 팔꿈치 검증
- [x] 사이드 굽힘 side (+3) — 한쪽 팔 위 + 어깨 기울임 0.06+ + 코 같은 방향
- [x] 어깨 으쓱 shoulder_shrug (+3) — baseline 대비 양 어깨 sw*0.20 위로
- [x] 목 좌우 풀기 neck_side (+4) — face roll Δ 0.25 rad + 어깨 수평 유지
- [x] 상체 앞 숙이기 forward_fold (+5) — 코 sw*0.30 아래 + 어깨 sw*0.15 아래
- [x] 기지개(Overhead)의 경우 1.0초 hold / 5초 쿨다운 / 1000ms 갭 허용으로 완화 및 카메라 상단 화각 잘림 극복 (나머지 스트레칭은 2.0초 hold + 60초 쿨다운 + 600ms 갭 허용)

### 안정화 알고리즘
- [x] ViolationSmoother (EMA α=0.15 + 히스테리시스 0.6/0.3 + 최소 3초 hold)
- [x] ViolationTracker (지속 시간 추적 + 알람 발사)
- [x] 부재 감지 (8초 미감지 → paused)

### 점수 시스템
- [x] 0-100 점수, localStorage 영속화
- [x] 지속 시간 가속 패널티 (0/2/10/30/60초 구간)
- [x] 연속 좋은 자세 회복 가속 (5분/15분 구간)
- [x] 빠른 회복 보너스 +2
- [x] 스트레칭 보너스 누적 방식 개편 (raw 횟수 단위에서 실제 획득 점수 기반으로 변경: 기지개 +5점 / 사이드 +3점 등) 및 대시보드 연동 ("스트레칭 점수" 카드로 통합)
- [x] 윈도우 간 storage 이벤트 동기화
- [x] visibilitychange/focus 시 localStorage 재로드 (suspend 보상)
- [x] frozen 조건 (비활성 owner / paused / cameraReady=false / baseline=null)

### 캘리브레이션
- [x] 5초 측정 + 5가지 적합성 체크 (상체 보임/고개 들기/머리 수평/손 떼기/자세 유지)
- [x] 65% 이상 적합 프레임이어야 베이스라인 저장
- [x] 측면 카메라 지원 (사용자 자연 자세를 베이스라인으로)
- [x] 잘못된 알림 신고 → sensitivity +0.1 (최대 2.0)

### 장시간 사용성 (자세 위반과 별도 카테고리 · 점수에 영향 없음)
- [x] **Phase 1** 정기 휴식 알림 — 30/50/120분 micro/standup/deep (KOSHA H-30, Cornell 50/10, Hedge 20-8-2)
- [x] 자리비움 5분+ / 깊은 휴식 5분+ → `secsSeated` 자동 리셋
- [x] **Phase 2** 누적 부하 알림 — 30분 슬라이딩 윈도우 자세별 누적 비율 25% 도달 시 (McGill 디스크 creep)
- [x] **Phase 3** 자세 변동성 알림 — 10분 윈도우 어깨/머리 std 부족 시 긍정 톤 스트레칭 권유 (McGill "next posture")
- [x] **Phase 4** 적응형 민감도 — 세션 길이(2/4/6h)·시간대(13–15시/16–18시) 임계 자동 완화 (max 보정)
- [x] WKWebView throttle 회피 — 무음 AudioContext `startKeepAwake()`
- [x] Pose loop freeze 자가복구 — heartbeat watchdog (30s 경고 / 60s `window.location.reload()`)
- [x] 4 분야 설정 라이브 reload (`*_CONFIG_CHANGED_EVENT`)
- [x] 위젯 state 에 `breakStatus` 포함 publish

### UI 모드 시스템
- [x] 메인 모드 ↔ 위젯 모드 mutually exclusive
- [x] 메인 X 클릭 → 자동 위젯 모드 전환 (Rust CloseRequested + 이벤트)
- [x] Dock 클릭 → 자동 메인 모드 전환 (Rust Reopen 이벤트)
- [x] 250ms 카메라 핸드오버 지연
- [x] 카메라 실패 시 800ms 후 재시도
- [x] 검출 owner 동적 전환

### 위젯 (플로팅 윈도우)
- [x] 별도 Tauri 윈도우 (`index.html#widget` URL hash)
- [x] frameless, transparent, alwaysOnTop, skipTaskbar
- [x] `macOSPrivateApi: true` 로 투명 배경 활성
- [x] 미니바 (상태 점 + 점수 + 라벨) — 설정 ON/OFF 가능
- [x] 카메라 아이콘 (위젯 모드에서만, SVG)
- [x] 호버 패널 (위반·코칭 메시지·마지막 알람·잘못된 알림 신고)
- [x] 드래그로 위치 이동 + localStorage 저장
- [x] 우측 상단 기본 배치

### 메인 모니터 화면
- [x] 카메라 영상 또는 실루엣 (프라이버시 모드)
- [x] 점수 chip 좌상단
- [x] 위반 chip 하단
- [x] 스트레칭 토스트 (3초 페이드)
- [x] "위젯 모드로 전환" / "다시 캘리브레이션" / "디버그 보기" 버튼
- [x] 디버그 패널 (모든 신호 실시간)

### 시각화 — 실루엣 모드
- [x] Image Segmenter 마스크 기반 사람 영역 색칠
- [x] Face mesh 478점 dots
- [x] 어깨 가로 라인
- [x] 멀티레이어 블러 (글로우 효과)
- [x] 포즈 기반 클리핑 (의자 등 주변 사물 제거)

### Rust 백엔드
- [x] 시스템 트레이 (메뉴 + tooltip + title 이모지 🟢🟡🔴⚪)
- [x] OS 네이티브 알림 (`tauri-plugin-notification`)
- [x] 단일 인스턴스 락 (`tauri-plugin-single-instance`)
- [x] 자동 시작 (`tauri-plugin-autostart`)
- [x] 윈도우 라이프사이클 (close→hide + 이벤트, reopen 이벤트)
- [x] Anthropic Claude API 클라이언트 + prompt caching (`claude-haiku-4-5`)

### 설정
- [x] 자세별 임계값 (durationSecs + sensitivity)
- [x] 미니바 표시 토글
- [x] 실루엣 모드 토글
- [x] LLM 코칭 활성화 + Anthropic API 키 입력
- [x] 자동 시작 토글
- [x] 앱 종료 버튼 (두 번 클릭 패턴)

### 대시보드
- [x] 일별 자세 이벤트 통계
- [x] 기록 삭제 옵션

### 데이터 저장 (localStorage)
- [x] 점수 / 베이스라인 / 임계값 / 위젯 상태 / 이벤트 로그 / 설정 전반
- [x] 백업/복원 키 18종 (5/14 4 Phase 설정 + `onboarded_v1` 포함, API 키 제외)

### 자동 업데이트
- [x] `tauri-plugin-updater` + `plugin-process` 통합, updater pubkey 임베드
- [x] `useUpdater` React hook — 마운트 5초 후 자동 체크, 24h 쿨다운, snooze 지원
- [x] `UpdateNotice` 배너 — 우측 하단, 릴리스 노트 요약 + 다운로드 진행 progress bar
- [x] 설정 "정보" 섹션 "업데이트 확인" 수동 버튼 (autoUpdate feature 일 때만)
- [x] GitHub Actions [release.yml](../.github/workflows/release.yml) — `tauri-action` 매트릭스 (macOS universal + Windows), 자동 서명·Release 생성·`latest.json` 게시
- [x] minisign 서명 키페어 생성 완료 (`~/.barosit-signing/`)
- [x] **셋업 완료** (2026-05-19): [jay365-code/barosit](https://github.com/jay365-code/barosit) public repo + Secrets 등록 + endpoints 치환
- [x] **풀 시연 검증 완료**: v0.1.0 → v0.1.1 자동 업데이트 흐름(체크 → 배너 → 다운로드 → 서명 검증 → 설치 → relaunch) 정상 동작

### 첫 실행 온보딩
- [x] 3 페이지 모달 — 환영 → 작동 원리(자세 6종 안내) → 프라이버시(온디바이스 강조)
- [x] `onboarded_v1` localStorage 키 기반 1회 표시
- [x] 마지막 페이지 "카메라 권한 허용" → `platform.requestPermissionsForMonitoring()`
- [x] 1페이지에 "건너뛰기" 옵션 (캘리브레이션으로 직행)
- [x] 페이지 인디케이터 3 페이지 모두 일관
- [x] 프라이버시 페이지에 [개인정보 처리방침](./privacy.md) / [이용약관](./terms.md) 외부 링크

### 법적 문서 (초안)
- [x] [개인정보 처리방침 (privacy.md)](./privacy.md) — KR 개인정보보호법 + GDPR 시야, localStorage 키별 명시
- [x] [이용약관 (terms.md)](./terms.md) — 라이선스·의료기기 아님·면책·분쟁 해결
- [x] **앱 내 모달로 표시** — react-markdown + remark-gfm. Onboarding 3페이지·SettingsDrawer "정보" 섹션 → [LegalDocument](../src/components/LegalDocument.tsx) 모달 (외부 GitHub 이탈 없음)
- [ ] **변호사 검토** (출시 전 필수)
- [ ] 사업자 등록 후 운영자 정보 확정
- [ ] 인증·동기화 도입 시 전면 재작성 ([auth-sync-plan.md §4](./auth-sync-plan.md) 참조)

### 사용자 프로필 — Phase 0 (로컬 stub) + 웹 인증 (Phase 1 일부)
- [x] [ProfileView](../src/views/ProfileView.tsx) 페이지 — 이름·아바타(이모지 10종)·작업환경(노트북/외장/혼합)
- [x] localStorage `user_profile_v1` + `dataBackup` BACKUP_KEYS 포함
- [x] MonitorView 헤더에 아바타 진입 버튼 (설정 아이콘 옆) — 클릭 시 ProfileView 전체 화면
- [x] ProfileView 좌상단 "홈으로" 버튼 → MonitorView 복귀
- [x] **웹 Google OAuth (2026-05-20)** — Supabase + Custom Domain `auth.barosit.com`. [src/auth/supabase.ts](../src/auth/supabase.ts) + [src/auth/useAuth.ts](../src/auth/useAuth.ts) + Marketing.tsx Login/AuthCallback/Profile 연결. 시크릿창 풀 흐름 검증 완료
- [x] **마케팅 사이트의 Profile 페이지** Google 사용자 정보 실데이터 표시 (이름·이메일·아바타·가입일·로그인 방식)
- [x] **결제 정보 삭제 (결제 수단 해제) 기능 구현 (2026-05-22)** — ProfileView 내에 `billing_key` 및 `card_info` 필드를 Supabase에서 즉시 null로 리셋하고 상태 동기화 처리하는 [결제 수단 삭제] 경고 버튼 추가
- [❌] **매직링크 (Supabase Email OTP)** — 이번 빌드에서 도입하지 않기로 결정 (Resend SMTP 셋업 취소)
- [ ] **Kakao OAuth** — Supabase native 미지원. OIDC + Kakao Developers 검수 필요
- [ ] **데스크탑 앱 OAuth (Tauri)** — deep link `barosit://auth/callback` + Rust `keyring` crate + ProfileView 의 "준비 중" 버튼 활성화. [auth-sync-plan.md Phase 1-3](./auth-sync-plan.md) 참조
- [ ] **Phase 2 (DB 스키마 + 동기화 엔진)** — profiles · posture_events · daily_scores · user_settings 테이블 + RLS + sync engine

---

## 향후 진행 항목

우선순위는 ROI + 사용자 임팩트 기준. 일정은 없음(바이브코딩).

### 🔴 출시 블로커 (반드시)

- [x] **macOS 코드 서명 + 공증** — Apple Developer ID 인증서 발급 및 `notarytool`/`stapler` 공증 완료. v0.3.6+ 빌드부터 `.app`과 `.dmg` 모두 공증 및 스테이플 처리되어 Gatekeeper 경고 없이 실행 가능.
- [x] **자동 업데이트** — `tauri-plugin-updater` + `plugin-process` 통합, useUpdater hook, UpdateNotice 배너, [release.yml](../.github/workflows/release.yml) CI, jay365-code/barosit Releases + Secrets 셋업. **2026-05-19 v0.1.0 → v0.1.1 풀 시연 검증 완료**
- [x] **프라이버시 정책 + 이용약관 (초안)** — [privacy.md](./privacy.md) + [terms.md](./terms.md). 카메라 온디바이스 처리·localStorage·LLM 옵션 명시. 한국 개인정보보호법 + GDPR 시야. Onboarding 3페이지·SettingsDrawer "정보" 섹션에 링크 노출. **최종 출시 전 변호사 검토 필요**
- [x] **첫 실행 온보딩** — 3 페이지 (환영 / 작동 원리 / 프라이버시) + 카메라 권한 요청 통합 ([src/views/Onboarding.tsx](../src/views/Onboarding.tsx), [App.tsx:177](../src/App.tsx))

### 🟡 시장 진입

- [x] **랜딩 페이지 + 도메인 + 배포** — `https://barosit.com` 라이브 (Cloudflare Pages 자동 배포). 남은 작업: 데모 GIF/스크린샷 추가, 다운로드 링크는 macOS 서명/공증 후 활성화
- [ ] **앱 이름 + 로고 + 아이콘** 최종 결정
- [ ] **가격 모델 결정** — 후보:
  - 완전 무료 + 오픈소스
  - 무료 + 사용자 본인 API 키로 LLM (추천)
  - Mac App Store $5-15 일회성
  - 구독 $2-5/월
- [ ] **영문화** (`react-i18next`)
- [ ] **데모 영상 + 스크린샷**

### 🟢 플랫폼 확장

#### Windows 버전
- [x] Rust cfg 분기 (`macos-private-api`/`RunEvent::Reopen`/트레이 `set_title` 모두 macOS only로 격리)
- [x] `RunEvent::Reopen` 대안 — 트레이 클릭 시 `main:reopened` emit (양 OS 공통)
- [x] GitHub Actions `windows-latest` 빌드 워크플로우 ([.github/workflows/build-windows.yml](../.github/workflows/build-windows.yml))
- [ ] 실제 Windows 러너 빌드 산출물 검증
- [ ] 트레이 동작 검증 (Action Center 알림)
- [ ] 외장 USB 웹캠 호환성 테스트
- [ ] Windows 카메라 권한 안내 텍스트
- [ ] Cmd+Q → Alt+F4 사용자 안내 (시스템 단축키는 OS 자동 처리)

#### Web 풀버전 (마케팅 funnel + 설치 불가 환경)
- [x] IPC 추상화 레이어 (`src/platform/` — tauri/web 분기)
- [x] 트레이/네이티브 알림 → 브라우저 Notification API + canvas favicon
- [x] 다중 윈도우 제거 (단일 페이지, 위젯 chunk 트리쉐이킹)
- [x] 위젯 모드 비활성 (웹은 메인만)
- [x] 설정 화면에 "백그라운드 모니터링은 데스크톱에서" 안내
- [x] `dev:web`/`build:web`/`preview:web` 스크립트
- [x] OG/Twitter 메타 + theme-color
- [ ] 다운로드 CTA 링크(데스크톱 앱 배포 후)
- [ ] 정적 호스팅 배포 (Cloudflare Pages 등)
- [ ] LLM 코칭 (v2 — 백엔드 프록시 필요)
- [ ] PWA 설정 (선택)

### 🔵 기능 보완

- [x] **에러 상태 UX** — 카메라 5종 분기 (거부/점유/없음/해상도/Abort) + 모델 로드 실패 메시지 + "다시 시도" 버튼
- [x] **데이터 백업/복원** — JSON export/import (API 키 제외)
- [x] **자세 종류 확장** — 모니터 거리 + 어깨 비대칭 (6종)
- [x] **위반 알림 강화** — 4가지 다중 선택(가장자리 글로우/위젯 확장/풀스크린/사운드) + 점진 강도
- [x] **스트레칭 감지 정밀화** — 4종 false positive 차단 (책상 위 자세·마우스 reach 등)
- [x] **민감도 default** 1.0 → 1.4 (실사용 체감 "보통")
- [ ] **시간대별 히트맵** 대시보드
- [ ] **주간/월간 트렌드** 대시보드
- [ ] **자세 종류 추가** — 목 회전, 시선 방향 등
- [ ] **휴식 알림** (포모도로 통합) — M3에서 글로벌 input hook 필요
- [ ] **외장 웹캠 / 멀티 모니터** 호환성 검증
- [ ] **배터리 모드** 감지 → FPS 자동 낮춤

### 🟣 기술 개선

- [ ] **SQLite 이전** — 대규모 이력 + 더 풍부한 분석 쿼리
- [ ] **OS 키체인** — API 키를 `keyring` crate로 저장
- [ ] **익명 텔레메트리** (옵트인) — 사용 패턴 분석
- [ ] **크래시 리포트** (Sentry 또는 자체)
- [ ] **자동화 테스트** (현재 거의 없음)

### 🟤 커뮤니티 / 운영

- [ ] **GitHub 오픈소스 공개** 검토
- [ ] **인앱 피드백** 채널
- [ ] **Discord/Slack** 사용자 커뮤니티
- [ ] **블로그** ("왜 거북목이 위험한지" 등 콘텐츠 마케팅)
- [ ] **Product Hunt** 출시

---

## 최근 주요 결정사항 (대화 맥락)

이전 대화에서 결정된 주요 사항:

1. **앱 이름**: `BaroSit` / `바로씻` (코드는 `barosit`, 도메인 `barosit.com`)
2. **시간 임계값 기본값**: 5초 (기획안 30초 → 사용자가 5초 선택)
3. **점수 그레이스**: 위반 시작 후 2초까지 패널티 0
4. **위젯 모드 ↔ 메인 모드 mutually exclusive** — 동시 활성 안 됨
5. **메인 X 클릭** → 위젯 모드 자동 전환 (백그라운드 모니터링 유지)
6. **Dock 클릭** → 메인 모드 자동 전환
7. **미니바**: 항상 떠 있음 (설정으로만 끔), 클릭 시 모드 전환 안 함 (드래그 전용)
8. **카메라 아이콘**: 위젯 모드에서만, 클릭 시 메인 모드 복귀
9. **데이터 저장**: localStorage (SQLite/키체인 안 함 — 단일 사용자 데스크톱이라 충분)
10. **검출 owner**: 한 시점에 하나만 (메인 OR 위젯)
11. **카메라 핸드오버**: 250ms 지연 + 800ms 재시도
12. **기획안.md** 는 코드 현재 상태 반영해 갱신됨. **코드가 진실의 원천**.
13. **장시간 사용성 (2026-05-14)**: 자세 위반과 별개 카테고리로 (a) 정기 휴식, (b) 누적 부담, (c) 자세 변동성 3개 신호 + (d) 적응형 민감도 보정 추가. Phase 1~4 로 코드에 명시. **자세 점수에는 영향 안 주고 알림만 별도 발사** — alarm fatigue 방지.
14. **자동 업데이트 (2026-05-19)**: `tauri-plugin-updater` + GitHub Releases. minisign 서명, latest.json 자동 메니페스트. v0.1.0 → v0.1.1 풀 사이클(자동 체크 → 배너 → 다운로드 → 서명 검증 → 설치 → relaunch) 검증 완료. **endpoint 의존성 때문에 GitHub repo 가 public 이어야 함**.
15. **약관 인앱 모달 (2026-05-19)**: 외부 GitHub URL 이탈 없이 `react-markdown` + `remark-gfm` 으로 [privacy.md](./privacy.md) / [terms.md](./terms.md) 렌더. Onboarding · SettingsDrawer · 향후 ProfileView 모두 동일 trigger 패턴.
16. **사용자 프로필 Phase 0 (2026-05-19)**: 로컬 stub (이름·이모지 아바타·작업환경). 인증·동기화는 별도 메이저 sprint ([auth-sync-plan.md](./auth-sync-plan.md)) — **온디바이스 원칙 변경 + 처리방침 전면 재작성** 동반.
17. **마케팅 사이트 호스팅 + 인증 스택 확정 (2026-05-20)**: 마케팅 사이트는 **Cloudflare Pages** (정적, 무료 무제한 대역폭, KR 엣지). 인증·DB 는 **Supabase** (서울 리전). 인증 방식은 **Google OAuth + Kakao OAuth** (Resend 매직링크는 도입하지 않기로 최종 결정) — 비밀번호 가입은 도입하지 않음 (재설정 흐름·해시 정책·보안 책임 절감). Apple OAuth 는 Mac App Store 출시 시점에 추가. Kakao 는 Supabase native 미지원이라 OIDC + Kakao Developers 검수 경로. [auth-sync-plan.md v2](./auth-sync-plan.md) 확정 — Phase 1 착수 가능.
18. **마케팅 사이트 법적 페이지 (2026-05-20)**: `/privacy`, `/terms`, `/contact` 라우트 추가. privacy/terms 는 `docs/*.md` 를 `?raw` import 해서 react-markdown 으로 렌더 — 앱 내 [LegalDocument 모달](../src/components/LegalDocument.tsx) 과 단일 소스. 문의는 `jhlee@gubed.co.kr` mailto + GitHub Issues. 로그인 UI 는 Google+Kakao 구조로 정리 (매직링크 제거), Apple 버튼·비밀번호 필드 제거.
19. **production 배포 + 인증 인프라 완성 (2026-05-20)**: 도메인 `barosit.com` 구매(hosting.kr) + DNS 를 Cloudflare 로 이전. **Cloudflare Pages** 에 GitHub 연동, main push 시 자동 배포 — `https://barosit.com` 라이브. **Supabase Pro** + **Custom Domain `auth.barosit.com`** 활성화 (Let's Encrypt SSL 자동), Google OAuth consent 에 BaroSit 로고 업로드 → Google 로그인 화면에 "auth.barosit.com(으)로 이동" 표시. Google Cloud Console 에 `https://barosit.com`/`https://barosit.pages.dev`/`http://localhost:1430` 3개 origin 등록, Supabase URL Configuration 의 Site URL = `https://barosit.com` + Redirect URLs 3개 허용 목록. 시크릿창에서 `barosit.com → Google → /landing` 풀 흐름 검증 완료. **외부 비용**: 도메인 ~₩18,000/년 (hosting.kr) + Supabase Pro $25/월. Cloudflare 는 Free 유지.
20. **기지개 감지 완화 및 포인트제 개편 (2026-05-22)**: 기지개 스트레칭(overhead) 동작 시 Y축 임계 경계값을 낮추어 카메라 뷰 위로 팔이 살짝 넘치더라도 감지가 잘 되도록 수정. 감지 쿨다운을 60초에서 5초로 대폭 낮추고, 최소 유지 시간을 2초에서 1초로, 연속 프레임 이탈 허용(gapToleranceMs)을 600ms에서 1000ms로 조율하여 반응성을 끌어올림. 아울러 기존의 누적 횟수(reps) 단위를 획득 점수 기반(기지개 +5점 / 사이드 +3점)의 "스트레칭 점수"로 개편하고 대시보드와 UI 토스트 표시의 점수를 일치시킴.
21. **Supabase 결제 정보 삭제 수단 신설 (2026-05-22)**: ProfileView에 [결제 수단 삭제] 경고 버튼을 신설하여 Supabase `user_subscriptions` 테이블에 연결된 카드 billing_key와 card_info 정보를 즉시 null로 해제 및 UI 반영.
22. **GitHub Push Protection 대응 (2026-05-22)**: `supabase/config.toml`에 포함되어 노출될 뻔한 Google / Kakao OAuth API secrets를 플레이스홀더로 전부 격리·보호 조치하여 Git Push 차단 문제를 안전하게 자가 해결 후 origin/main으로 원격 Push 완료.
23. **실시간 타이머, 연간 공헌도 그리드 및 소급 패키징 동기화 엔진 완성 (2026-05-23)**:
    - **타이머 멈춤 복구**: 브라우저 웹 전용 및 태우리 단독 뷰 가동 시 타이머가 동작하지 않던 버그를 1초 주기 refs 기반 실시간 엔진 장착으로 완벽 복구하고 `StorageEvent`로 다중 탭 연동.
    - **Retroactive Pack-and-Sync**: 자정 전 컴퓨터 종료 시 잔존 임시 데이터를 기동 시 소급 패키징하여 로컬 장기 통계 역사 DB에 저장하고 백그라운드 일괄 배치 동기화하는 엔진 구축.
    - **연간 캘린더 그리드**: 12행 x 31열의 Github contribution heatmap 스타일 잔디밭 그리드 신설 및 정형외과 척추생체역학 논문 근거 명시.
    - **시간 표시 레이아웃 개선**: 말풍선 배지를 `top: 6px`로 배치하고 헤더 `marginBottom`을 `24px`로 늘려 텍스트 가림을 해결하고, 점선 지시선을 말풍선 하단(`top: 22px`)에서만 출발하도록 리팩토링하여 지시선 상단 돌출을 미적으로 해결.


## 알려진 한계 / 제약

1. **macOS 전용 일부 동작** — `RunEvent::Reopen`, `macOSPrivateApi`, 트레이 이모지 등은 macOS 전제
2. **MediaPipe 모델 외부 CDN 의존** — 첫 실행 시 약 20MB 다운로드 필요. 오프라인 사용 시 캐시되어 있어야 함.
3. **dev 모드 메모리 부담** — RSS 2.7GB+ (프로덕션 빌드는 600MB-1GB)
4. **빠른 움직임 시 마스크 노이즈** — Image Segmenter 신뢰도 저하 가시화 (EMA로 완화 중)
5. **카메라 권한 다이얼로그** — dev 모드는 호출 주체가 Terminal/VSCode 등으로 잡힘. 프로덕션 빌드 후 앱 자체로 권한 받아야 정상.

## 🐞 발견된 버그 / 사용 중 리포트

> 실사용 중 사용자 리포트. 재현·원인 파악·수정.

- [x] **메인 윈도우가 다른 앱에 가려져 있을 때 미니바 동작 안 함** (2026-05-19 리포트)
  - 증상: BaroSit 메인 윈도우가 visible 이지만 다른 앱(에디터·브라우저 등) 뒤로 가려진 상태에서 미니바 상태/점수가 멈춤
  - 원인: 메인 owner pose loop가 macOS WKWebView occluded throttle로 슬립함.
  - 해결 완료 (2026-05-20): 메인 창 가시성 감지(`main_visible`)를 루트 레벨(`App.tsx`)로 격상(Lift-up)하고 `document.hidden`을 활용해 감지하도록 설계. 가려지면 미니바(`Widget.tsx` / `useMonitoringEngine`)가 카메라 및 감지 주체를 안전하게 인계받음. 복귀 시에는 250ms의 핸드오버 지연 버퍼를 두어 카메라 장치 점유 충돌 없이 부드럽게 되돌아가도록 처리함. 이 과정에서 발생했던 캘리브레이션 뷰 진입 시의 카메라 먹통 충돌 현상까지 완벽히 해결함.

## QA 대기 — 5/14 4 Phase 동작 검증 체크리스트

> 사용자가 실사용 중 자연 검증. 발견 즉시 본 문서 또는 별도 PR. 자동 검증(타입체크·정적 연결·Phase 4 순수 함수 8케이스)은 통과(2026-05-19).

- [ ] **Phase 1 — 휴식 알림**: 설정 → "휴식 알림" → `환기 미리보기` / `일어서기 미리보기` / `긴 휴식 미리보기` 3 버튼 발사 → 글로우·위젯 확장·사운드 정상
- [ ] **Phase 2 — 누적 부하**: 윈도우 10분 / 임계 10% 로 단축 후 1~2분간 의도적 거북목·슬라우칭 반복 → 환기 알림 발사
- [ ] **Phase 3 — 자세 변동성**: 윈도우 5분으로 단축 + 정자세 5분 정지 유지 → 긍정 톤 권유 발사
- [ ] **Phase 4 — 적응형 민감도**: 활성화 후 DevTools 콘솔 `localStorage.setItem('adaptive_sensitivity', JSON.stringify({enabled:true, sessionStartedAt: Date.now() - 6*3600*1000})); location.reload();` → 디버그 패널에 `postureMultiplier ≈ 1.3` 보정 확인
- [ ] **이벤트 로그 적재**: 4 카테고리 발사가 [eventLog.ts](../src/pose/eventLog.ts) → 대시보드 통계에 반영되는지
- [ ] **알림 강화 4 모드 호환성**: 글로우·위젯 확장·풀스크린·사운드 4 모드가 4 카테고리 모두에서 동일하게 동작하는지
- [ ] **keepAwake**: 메인 윈도우 hide 상태로 5분 이상 두고 위젯 모니터링 지속되는지
- [ ] **watchdog**: 의도적 freeze 시뮬 시 60초 후 reload 동작

### 발견 시 후속 작업 후보 (검증 효율·UX 개선)

— 본 문서 "📝 작은 후속 작업 (Backlog)" 섹션 참조.

## 📝 작은 후속 작업 (Backlog)

> 출시 블로커는 아니지만 정리해 둘 작은 개선들. 시연·검증·실사용 중 발견.

### UX·UI 다듬기
- [x] **UpdateNotice "최신 버전입니다" 스타일** — 현재 빨간 에러(.b-update-error) 로 뜸 → info 스타일 분리 ([src/updater.ts](../src/updater.ts) `setError("최신 버전입니다")` → 별도 `setInfo()` 추가)
- [x] **SettingsDrawer 버전 라벨 동적화** — hard-code "0.1.x" → `@tauri-apps/api/app` 의 `getVersion()` 으로 동적 표시 (매 release 마다 손 안 대도 되게)
- [ ] **누적·변동성·적응형 미리보기 버튼** — 검증 효율 위해 휴식 알림처럼 mock 발사 버튼 추가
- [x] **적응형 민감도 보정값 라이브 표시** — 설정 패널에 `postureMultiplier` / `reason` 라이브 표시 (디버그·신뢰 개선)

### 정합성 확인
- [ ] **"머리 좌우 기울임" 자세 종류** — MonitorView 자세 빈도 그래프에 7번째 항목이 보임. 정식 6종 외에 추가됐는지, [analyzer.ts](../src/pose/analyzer.ts) / [types.ts](../src/pose/types.ts) 확인 + 문서 일관성 맞추기

### CI / 빌드 정리
- [ ] **build-windows.yml 중복 트리거 정리** — release.yml 이 Windows 도 빌드하므로 tag push 트리거 제거, `workflow_dispatch` 전용으로 (현재 매 v* push 마다 실패 1건 더 생성)

## 다음 작업 시작 시 체크리스트

새 대화에서 이어서 작업할 때:

1. **이 문서 + [development.md](./development.md)** 먼저 읽기
2. 현재 어떤 항목을 하려는지 확정 (위 "향후 진행 항목" 중 선택)
3. `npm run tauri dev` 로 동작 확인
4. 변경 후 [changelog.md](./changelog.md) 갱신
5. 큰 변경은 이 문서의 "개발 완료 항목" / "향후 진행 항목" 도 업데이트

## 빌드 / 실행 명령

```bash
# 데스크톱 개발
npm run tauri dev

# 데스크톱 프로덕션 빌드
npm run tauri build
# → src-tauri/target/release/bundle/macos/BaroSit.app

# 웹 개발
npm run dev:web                  # http://localhost:1430

# 웹 프로덕션 빌드
npm run build:web                # dist-web/ 정적 번들
npm run preview:web              # 로컬에서 미리보기
```

웹 배포는 `dist-web/` 디렉토리를 Cloudflare Pages·Vercel·Netlify 등 정적
호스팅에 그대로 업로드하면 됨. HTTPS 필수(카메라 권한). MediaPipe 모델은
Google CDN에서 자동 로드되므로 별도 작업 불필요.

## 코드 진입점 빠른 참고

| 영역 | 파일 |
|---|---|
| 플랫폼 추상화 (tauri/web 분기) | `src/platform/` |
| 앱 라우팅 (main vs widget) | `src/main.tsx` |
| 메인 앱 (탭 + status pill) | `src/App.tsx` |
| 모니터 화면 | `src/views/MonitorView.tsx` |
| 위젯 (플로팅) | `src/views/Widget.tsx` |
| 캘리브레이션 | `src/views/CalibrationView.tsx` |
| 설정 | `src/views/SettingsView.tsx` |
| 검출 통합 hook | `src/hooks/useMonitoringEngine.ts` |
| 4모델 검출 | `src/pose/detector.ts` |
| 자세 6종 판정 | `src/pose/analyzer.ts` |
| 점수 hook | `src/hooks/usePostureScore.ts` |
| 정기 휴식 / 누적 부하 / 변동성 / 적응형 민감도 | `src/pose/breakTracker.ts`, `src/pose/cumulativeLoadTracker.ts`, `src/pose/variabilityTracker.ts`, `src/pose/adaptiveSensitivity.ts` |
| 알림 디스패처 (4 카테고리) | `src/alertConfig.ts` |
| WebView throttle 회피 / 자가복구 | `src/keepAwake.ts`, `src/watchdog.ts` |
| 자동 업데이트 (hook + UI) | `src/updater.ts`, `src/components/UpdateNotice.tsx` |
| 릴리스 워크플로우 | `.github/workflows/release.yml` |
| 약관·처리방침 모달 | `src/components/LegalDocument.tsx`, `docs/privacy.md`, `docs/terms.md` |
| 사용자 프로필 (Phase 0) | `src/userProfile.ts`, `src/views/ProfileView.tsx` |
| 첫 실행 온보딩 | `src/views/Onboarding.tsx` |
| Tauri 명령 + 이벤트 | `src/ipc.ts` |
| Rust 메인 + 윈도우 라이프사이클 | `src-tauri/src/lib.rs` |
| 트레이 | `src-tauri/src/tray.rs` |
| LLM | `src-tauri/src/llm.rs` |
| Tauri 윈도우 설정 | `src-tauri/tauri.conf.json` |
| Tauri 권한 | `src-tauri/capabilities/default.json` |
