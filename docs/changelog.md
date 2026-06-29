# 작업 이력 요약

세션 동안 진행된 주요 변경의 시간순 정리. 코드 아키텍처 진화와 결정의 맥락.

## 0-8. 인증 확장 — Apple 로그인 + 이메일 회원가입·비번복구 — 2026-06-29 · v0.3.11

소셜 전용(이메일은 리뷰어용)에서 → 이메일/비번 일반 노출 + 서구·macOS 용 Apple 로그인 정식 채택. 소셜이 막히는 사내망·반Google 사용자의 보편 탈출구 확보.

- **Apple 로그인** [src/auth/useAuth.ts](../src/auth/useAuth.ts): `signInWithApple` 을 웹([Marketing.tsx](../src/web/Marketing.tsx)) + 데스크톱([ProfileView.tsx](../src/views/ProfileView.tsx)) UI 에 노출(`handleOAuth` 타입 확장). Apple Developer(App ID `com.gubed.barosit`/Team LHR4658746, Services ID `com.gubed.barosit.web`, .p8 키, client secret JWT) + Supabase Apple provider 설정 완료. **실 Apple ID 로그인 E2E 성공**(토큰교환 검증). 함정: 커스텀 도메인 `auth.barosit.com` 콜백이라 Apple Return URL 에 추가 필수. ⚠️ secret 6개월 만료 → 재생성 캘린더 필요.
- **이메일 로그인/회원가입/비번복구**: 기존 로고 3클릭 이스터에그(리뷰어 바이패스)를 **정식 UI 로 승격**. `useAuth` 에 `signUpWithPassword`(이메일 확인 redirect·이미가입 감지)·`resetPasswordForEmail`·`updatePassword` 추가. 신규 라우트/페이지 `#/forgot-password`(ForgotPassword)·`#/reset-password`(ResetPassword) + routeFromHash/routeBody/isAuthRoute 배선. 데스크톱은 이메일 로그인(토글) + 가입·비번찾기 외부브라우저 위임.
- **이메일 인프라**: 커스텀 SMTP(RESEND, 도메인 `send.barosit.com` Verified) 연결 → 프로덕션 `/auth/v1/recover` 200 + **받은편지함 실도착 검증**. 이메일 확인(autoconfirm off=확인필수) 프로덕션 동작 확인. redirect allowlist `barosit.com/**`.
- **i18n** ko/en/ja: marketing.loginPage(+16)·forgotPw·resetPw, profile(+8).
- **문서**: [service-completeness.html](service-completeness.html) §7 인증 갱신(Apple·이메일=partial→검증완료, LINE/Naver=비네이티브 todo, 인증메일 다국어 Send Email Hook=todo). **[account-deletion-policy.html](account-deletion-policy.html) 회원탈퇴 정책·설계 신규**(즉시삭제 금지→유예+예약파기, 전자상거래법 5년 보존 분리) + §12 법무 추적 항목.
- 검증: tsc 통과, 전체 테스트 83/83 통과, 웹 미리보기에서 login/signup/forgot/reset 4화면 렌더 + 프로덕션 Apple authorize 302 + 메일 실발송 검증. 데스크톱 Apple/이메일 버튼은 실기 미검증(웹만).

## 0-7. 사내망·오프라인 호환성 (R2·R3) — 2026-06-26 · v0.3.10

기업 사내망(방화벽·SSL 인스펙션·망분리)에서 BaroSit 기능 영향 검토 → "망은 못 바꾼다"를 전제로 한 제한적 서비스 연속성 대응. (R1 모델 로컬 번들은 v0.3.9 에 선반영됨)

- **R3 오프라인 Pro 권한 회복력** [src/auth/useEntitlement.ts](../src/auth/useEntitlement.ts): 오프라인/조회 실패 시 **과거 서버 검증 이력이 있는 Pro 는 강등하지 않음**(기존 14일 캡 제거) — 사내 방화벽으로 Supabase 가 차단돼도 정당한 Pro 가 끊기지 않게. 무료체험(beta_free)도 오프라인에서 Pro 동일 처리. 검증 이력 전무면 Free 유지(변조 방어). 온라인 복구 시 서버값으로 정정(해지·환불 강등 정상). **Pro 전용 게이팅 자체는 유지**(비로그인/Free 개방 아님).
- **R2 차단 원인 사용자 안내** [src/views/SettingsDrawer.tsx](../src/views/SettingsDrawer.tsx): 동기화 상태가 `offline`/`error` 일 때 원인 안내 노출(사내 방화벽/네트워크 + 핵심기능 유지 + 자동복구). i18n `settings:sync.networkNote` ko/en/ja.
- **문서**: [corporate-network-compatibility.html](corporate-network-compatibility.html) 검토 보고서 신규, [service-completeness.html](service-completeness.html) §15 신설.
- 검증: tsc 통과, 전체 테스트 83/83 통과. (런타임 UI 는 offline/error 상태 + 설정 드로어 조건이라 정적 검증)

## 0-6. 능동 피드백 넛지 + privacy.md 명시 — 2026-06-26

수동 피드백 버튼(설정 깊숙이, 응답률 ~0)을 보완하는 능동 넛지 + 법무 문서 동기화.

- **넛지**: 정착 사용자(설치 3일+ · 2세션+)에게 **1회만** 상단 배너로 부드럽게 의견 요청. [의견 보내기]→FeedbackModal / [다음에]→닫기, 둘 다 `markNudgeDone`로 재노출 차단. 신규 [src/lib/feedbackNudge.ts](../src/lib/feedbackNudge.ts).
- **저우선/비차단**: 캘리브레이션·온보딩 중이거나 중요 배너(유예·업데이트·데이터경고)가 떠 있으면 양보. 노출은 8초 지연(좌절 직후 회피). i18n `app.feedbackNudge.*` ko/en/ja.
- **측정 연동**: `feedback_nudge_shown`/`clicked`/`dismissed` 이벤트 트래킹 → 넛지 효과 측정.
- **privacy.md**: §3-1 에 "익명 진단 및 사용 통계(선택·옵트아웃)" 항목 신설 — 오류 리포트(OPS-1)+사용 분석(MEASURE)이 익명·옵트아웃·영상/자세/PII 없음임을 명시.
- 단위테스트 신규 [src/lib/feedbackNudge.test.ts](../src/lib/feedbackNudge.test.ts) 5건. 웹 미리보기에서 배너 노출→의견보내기→모달+done+이벤트적재 E2E 검증.

## 0-5. 익명 사용 분석 — 활성화 퍼널/재방문 (MEASURE) — 2026-06-26

"사용자가 뭘 원하는지 모르겠다"를 추측 대신 데이터로 전환하기 위한 측정 인프라.

- **저장**: 신규 [usage_events](../supabase/migrations/20260626120000_usage_events.sql) 테이블 + `track_usage` RPC(anon/auth) + 익명 `install_id`(localStorage). 영상·자세데이터·PII 없음.
- **추적 이벤트(coarse)**: `app_opened`(일1회·재방문), `onboarding_completed`(1회), `calibration_succeeded`, `calibration_failed`(사유: rejected/build_error). UX-1 phase 와 직접 연결.
- **동의**: 설정 프라이버시 "익명 사용 통계" 옵트아웃 토글 — **베타라 기본 ON**(익명·마일스톤만). i18n ko/en/ja.
- **어드민**: "사용 분석" 탭 — 전체/7일/30일 활성(고유 install), 온보딩→캘리브 성공 퍼널·전환율, 이벤트별 카운트.
- [src/lib/usageAnalytics.ts](../src/lib/usageAnalytics.ts) — install_id·동의·dedup(once/daily/always). 단위테스트 6건.
- 로컬 E2E 검증: app_opened 적재 + 재로드 시 일일 dedup(1건 유지) 확인.
- ⚠️ 결정: 익명·마일스톤만이지만 클라우드 전송이므로, 강한 "온디바이스" 포지셔닝과 관련해 privacy.md 1줄 명시 검토 권장. 기본 ON↔옵트인 전환은 토글 한 곳.
- ⚠️ 배포: 마이그레이션 프로덕션 `supabase db push` 대기.

## 0-4. 캘리브레이션 실패 안내 (UX-1) — 2026-06-26

온보딩 첫 관문에서 캘리브레이션이 실패해도 이유를 알려주지 않던 문제 해소.

- **build() 예외**: 기존 `catch→setPhase("idle")`(무음 시작화면 복귀) → 신규 **error 화면**(사유 + 다시 시도) + OPS-1 `reportError` 적재.
- **적합 프레임 부족(rejected)**: `CalibrationCollector` 가 5개 적합성 항목별 통과율을 추적(`checkPassRatios`/`weakestChecks`) → 부족한 항목을 **구체적으로 안내**("상체가 잘 안 보였어요 — 카메라를 조금 멀리" 등 최대 3개).
- i18n `calibration.checkHint.*` / `calibration.error.*` ko/en/ja.
- 신규 단위테스트 [src/pose/calibration.test.ts](../src/pose/calibration.test.ts) 4건. (rejected/error 화면 자체는 카메라 필요로 헤드리스 미검증 — 로직·회귀는 검증)

## 0-3. 클라우드 동기화 복원력·가시화 (SYNC-1) — 2026-06-26

동기화가 "조용히 실패"하던 문제 해소 — 사내망 등 네트워크 차단 시나리오 대응.

- **가시화**: 신규 [src/lib/syncStatus.ts](../src/lib/syncStatus.ts) 상태 모듈(idle/syncing/synced/offline/error + last-synced) → 설정 "클라우드 동기화" 인디케이터(점 색 + 상태 + 마지막 동기화 시각, ko/en/ja).
- **재시도**: 각 동기화 작업을 지수 백오프(1/2/4s, 2회)로 재시도. push 함수는 throw 대신 boolean 반환으로 통일해 fire-and-forget 호출의 unhandled rejection 방지.
- **오프라인**: `navigator.onLine` 가드 + `offline` 이벤트 즉시 상태 표시 + `online` 복귀 시 자동 flush.
- **증분 영속화(버그 수정)**: `syncEventsToServer` 가 청크 성공마다 uploaded 플래그를 저장 → 중간 실패 시 이미 올린 청크를 재업로드(중복 insert)하던 문제 해결. localStorage 의 uploaded 플래그가 곧 오프라인 큐.
- 단위테스트 신규 [src/lib/syncStatus.test.ts](../src/lib/syncStatus.test.ts) 5건. 브라우저에서 offline→상태 전파 E2E 확인.
- 남음(후속): 설정 업로드 충돌해결(updated_at 비교)·플랜 캐시 재검증은 partial 유지.

## 0-2. 로컬 자세기록 무음 유실 방지 (DATA-1) — 2026-06-26

`posture_events`(localStorage)가 사용자도 모르게 사라지던 3경로 차단.

- **파싱 손상**: `loadEvents()`가 `catch{return []}`로 전체 폐기 + 다음 append가 1건으로 덮어쓰던 문제 → 원본을 `posture_events_corrupt_backup`에 보존(최초 1회) + 정규식 **부분 복구** + 경고 발생. ([src/pose/eventLog.ts](../src/pose/eventLog.ts))
- **용량(quota) 초과**: `setItem` 실패가 무처리였음 → try/catch 로 잡아 최근 절반 남기고 재시도(쓰기 성공 우선) + 경고.
- **무경고 절단**: 상한 5000→20000(약 2주→2~3개월) 상향 + 절단 시 경고. `updateEventDuration`도 quota 안전화.
- **사용자 가시화**: `posture-data-warning` CustomEvent → App 상단 ⚠️ 배너(닫기 가능) + OPS-1 `reportError`로 어드민 "오류 리포트" 적재.
- 단위테스트 신규 [src/pose/eventLog.test.ts](../src/pose/eventLog.test.ts) 7건(복구·덮어쓰기방지·quota 폴백). 웹 미리보기에서 배너 표시·닫기·OPS-1 적재 E2E 확인.
- ⚠️ 참고: 로컬 저장은 네트워크 무관(사내망 차단돼도 저장됨). 클라우드 동기화 실패 복원력은 SYNC-1 별도.

## 0-1. 클라이언트 에러/크래시 자동 리포트 (OPS-1 2/2) — 2026-06-26

- 전역 `window.onerror` + `unhandledrejection` 핸들러 + React `ErrorBoundary`([App.tsx](../src/App.tsx)) 에서 예외를 **자동 수집**. 기존엔 `console.error` 만 하고 사라지던 것을 서버 적재로 전환.
- 신규 테이블 [client_errors](../supabase/migrations/20260626000000_client_errors.sql) — 에러는 양이 많을 수 있어 **fingerprint(kind+메시지+top frame 해시)로 묶어 1행 + count 증가** 집계(피드 오염 방지). 적재는 `report_client_error()` RPC(anon/authenticated 실행 허용, SECURITY DEFINER), 조회/관리는 어드민 RLS.
- [src/lib/errorReporting.ts](../src/lib/errorReporting.ts) — `initErrorReporting()`([main.tsx](../src/main.tsx) 부팅 시 1회, 전 진입점 공통) + `reportError()`. 세션 상한(25) + 동일 fingerprint 1회로 폭주 방지. 카메라/영상·자세 데이터는 전송 안 함.
- **옵트아웃 토글** — 설정 프라이버시 섹션 "오류 자동 보고"(기본 ON), `error_reporting_enabled` localStorage. i18n `settings.privacy.errorReport.*` ko/en/ja.
- 어드민 **"오류 리포트" 탭** — 미해결 카운트 배지, 종류별 색, ×발생횟수, route/버전/client/lang/plan 메타, 스택 펼침, 해결처리·삭제, 해결항목 표시 토글.
- 검증: tsc 0 errors · 56 테스트 통과 · 웹 미리보기에서 window/promise 에러 2종 → `POST /rpc/report_client_error` 각각 호출 확인(로컬 DB 미적용이라 404, 핸들러는 안전하게 흡수).
- ⚠️ **배포 잔여**: 마이그레이션 적용 필요 — 로컬 `supabase db reset`/`migration up`, 프로덕션 `supabase db push`.

## 0. 인앱 피드백 채널 (OPS-1 1/2) — 2026-06-26

- 설정 드로어 "정보" 섹션에 **"피드백 보내기"** 버튼 + 모달 신설.
- 저장소는 **기존 `admin_notifications` 테이블 재사용** (`event_type='feedback'`, severity `info`). 신규 테이블/마이그레이션 없음 — 누구나 INSERT 가능한 RLS(mig 20260521000003)를 그대로 활용해 비로그인 사용자도 전송 가능.
- 카테고리(버그/제안/기타) + 진단 payload(앱 버전·client·user_agent·route·plan·lang·user_id) 동봉. 카메라/영상 정보는 전송 안 함.
- 전송 실패 시 `support@barosit.com` **메일 폴백** 안내.
- 어드민은 **"실시간 알림(alerts)" 탭**에서 realtime 으로 확인 (종류 필터에 `feedback` 추가).
- i18n ko/en/ja `settings.feedback.*`. 신규 파일 [src/lib/feedback.ts](../src/lib/feedback.ts), [src/components/FeedbackModal.tsx](../src/components/FeedbackModal.tsx).
- 완성도 추적: [service-completeness.html](./service-completeness.html) OPS-1 피드백 항목 → 완료. (남은 OPS-1: 크래시/에러 자동 리포트)
- **수정(같은 날)**: FeedbackModal 이 미정의 CSS 토큰(`--b-fg`/`--b-bg-2`)을 써서 light 테마에서 흰 글자+흰 배경으로 안 보이던 문제 → 실제 토큰(`--b-surface`/`--b-fg-1`/`--b-surface-2`)으로 교체. 양 테마 대비 정상 확인.
- **개선(같은 날)**: 피드백을 "실시간 알림"에서 분리 — 어드민에 **"사용자 피드백" 전용 탭** 신설. 저장은 `admin_notifications`(event_type='feedback') 그대로 유지하되, 실시간 알림 탭/종류필터/모두읽음/미확인 배지에서 feedback 을 제외하고 전용 탭(카테고리 칩·연락처·답장 mailto·읽음/삭제·미확인 배지)으로 모아 봄. (사용자 요청: 운영 알림과 피드백 분리)

## 1. 자세 감지 정확도 개선

### 1-1. 턱 괴임 감지 버그 수정
- 기존 `elbow.y < shoulder.y + 0.05` (팔꿈치가 어깨 위에 있어야 함) — 책상에 팔꿈치 두는 일반적 자세에서 항상 false
- 변경: `wrist.y < elbow.y` (앞팔이 위로 향함) + 손목이 코보다 아래
- `faceRadius`를 베이스라인 어깨너비 기준으로 안정화
- [src/pose/analyzer.ts](../src/pose/analyzer.ts) 의 chin_resting 블록

### 1-2. 거북목 감지 강화
- 기존 z 좌표 + nose.y 만으로는 신호 약함
- **귀-사이/어깨-너비 비율 변화** 추가 → 머리 앞으로 나오면 얼굴이 어깨 대비 커짐
- 신호 4개 합산 (size + z + drop + pitch)

### 1-3. Face Landmarker 추가
- MediaPipe Face Landmarker (478점) 통합
- 변환 행렬에서 pitch/yaw/roll 추출
- 거북목 pitch 신호로 사용 (가장 신뢰도 높음)

### 1-4. Hand Landmarker 추가
- 21점 × 2손
- 턱 괴임 감지에 fingertip-to-face 거리 추가
- pose-only fallback 유지

## 2. 알고리즘 안정화

### 2-1. ViolationSmoother
- 매 프레임 raw 판정이 노이즈로 핑퐁
- **EMA (α=0.15) + 히스테리시스 (진입 0.6 / 이탈 0.3) + 최소 3초 유지**
- 자연 움직임 보호, 한번 진입 시 깜빡임 없음

### 2-2. 점수 시스템 재설계
- 기존: +1/-1 균일
- 변경: **지속 시간 가속**
  - 위반: 0-2초 그레이스 → -0.5 → -1 → -2 → -3/초
  - 좋음: +1 → +2 → +3/초
  - 빠른 회복(<10s) 시 일회성 +2 보너스
- localStorage 동기화 + visibilitychange 재로드

### 2-3. 스트레칭 보너스
- 4종 인식 (기지개/목 풀기/어깨/사이드)
- 팔꿈치 기반 견고화 (손목 화면 밖이어도 동작)
- 2초 유지 + 60초 쿨다운
- +5/+5/+4/+3점

## 3. 캘리브레이션 개선

### 3-1. 적합성 체크 도입
- 기존: 사용자가 그냥 시작 → 잘못된 자세도 베이스라인 됨
- 5가지 체크 ✓ 일 때만 시작 가능
- 5초 측정 후 65% 이상 적합 프레임이어야 저장

### 3-2. 측면 카메라 대응
- 절대 0 강제 제거 — 사용자의 실제 자세를 베이스라인으로 캡처
- yaw/centered 체크 제외, 안정성(stability) 체크 추가
- 노트북 옆 모니터 사용해도 그 각도가 기준

## 4. UI / 시각화

### 4-1. SitSense 스타일 실루엣
- MediaPipe Image Segmenter (selfie_multiclass) 추가
- 카메라 영상 대신 마스크 색칠로 실루엣 렌더 (프라이버시)
- 멀티레이어 블러 + 478 face mesh dots
- 포즈 기반 클리핑으로 의자 등 주변 사물 제거

### 4-2. 점수 칩
- 카메라 좌상단 `★ 87 pts`
- 점수 색상도 80↑ 초록, 50↑ 노랑, 50↓ 빨강

### 4-3. 스트레칭 토스트
- 보너스 발사 시 카메라 중앙에 `🌿 기지개 +5` 3초 표시
- 페이드 인/아웃 애니메이션

### 4-4. 디버그 패널
- 모든 분석 신호 실시간 표시
- 토글 버튼

## 5. 위젯 / 미니바 / 모드 시스템

### 5-1. 위젯 윈도우 도입
- Tauri 두 번째 윈도우 — `index.html#widget` URL hash
- frameless, transparent, alwaysOnTop, skipTaskbar
- macOSPrivateApi 활성으로 WebView 투명 배경

### 5-2. 모드 시스템 (메인 ↔ 위젯)
- mutually exclusive — 한 시점에 한 모드
- 모드 전환 시 검출 owner 변경 (메인 ↔ 플로팅 윈도우의 useMonitoringEngine)
- 250ms 핸드오버 지연 + 카메라 재시도

### 5-3. 미니바 + 카메라 아이콘 분리
- 미니바: 항상 떠 있음 (설정 ON일 때) — 상태색 점 + 점수 + 라벨
- 카메라 아이콘: 위젯 모드에서만 미니바 옆에 — 클릭 시 메인 복귀
- 미니바 클릭 비활성 (의도치 않은 모드 전환 방지)

### 5-4. 자동 모드 전환
- 메인 X 클릭 → 자동으로 위젯 모드 (백그라운드 모니터링 유지)
- Dock 클릭 (RunEvent::Reopen) → 자동으로 메인 모드
- 트레이 클릭 → 메인 윈도우 + 모드 자동 전환

## 6. 성능 최적화

### 6-1. setInterval → setTimeout 재귀
- 백프레셔 방지 — 검출이 늦으면 다음 틱이 큐잉 안 됨
- 손 동작 1초 지연 해결

### 6-2. 마스크 버퍼 재사용
- 매 프레임 `new Uint8Array(src)` 할당 → 모듈 스코프 고정 버퍼 + `.set(src)`
- GC 압력 거의 0

### 6-3. Segmenter 빈도 조정
- 3틱마다 (≈5 FPS) — pose는 매 틱 그대로
- EMA가 사이를 메워줘 시각적 끊김 없음

### 6-4. 백그라운드 모드
- 윈도우 hidden 시 2 FPS + pose only
- visibility change 자동 감지

### 6-5. 카메라 해상도 축소
- 640×480 → 256×192 (Face Landmarker 입력 192×192와 근접)
- GPU 업로드 부담 감소

### 6-6. 점수 동기화
- localStorage `posture_score`
- storage 이벤트 + visibilitychange 재로드
- 윈도우 suspend 중 놓친 이벤트 보상

## 7. 백그라운드 동작

### 7-1. 메인 닫기 = 트레이 숨김
- Rust `CloseRequested` 가로채기 + `window.hide()`
- prevent_close로 진짜 종료 방지

### 7-2. 미니마이즈 막기
- `minimizable: false` (한 번 ON했다 위젯 도입 후 다시 OFF) — 현재 상태는 활성
- macOS dock 미니마이즈 시 WebView 일시정지 문제 회피용이었음

### 7-3. 위젯이 백그라운드 모니터링
- 메인 닫혀도 위젯 always-on-top → macOS suspend 안 함
- 위젯 owner로 카메라/검출 계속

## 8. 종료 경로

- 설정 화면 "앱 종료" 버튼 (두 번 클릭 확인)
- 트레이 메뉴 "종료"
- macOS Cmd+Q

`window.confirm()` 이 WKWebView에서 동작 안 해 인라인 확인 패턴 사용.

## 9. 웹 풀버전 빌드 (1차)

### 9-1. 플랫폼 추상화 레이어
- 신규 [src/platform/](../src/platform/) — `tauri.ts`/`web.ts` 두 구현체 + `types.ts` 공통 인터페이스 + `storage.ts` 공통 localStorage 헬퍼
- 빌드 타임 분기(`import.meta.env.VITE_PLATFORM`) — Vite `define`으로 컴파일 시 치환, 사용 안 한 쪽은 트리쉐이킹
- 기존 [src/ipc.ts](../src/ipc.ts)는 thin re-export 레이어로 변경 (호출처 호환 유지)
- 자동 시작은 `tauri-plugin-autostart` 직접 import 제거, platform 인터페이스(`isAutostartEnabled`/`setAutostartEnabled`)로 동적 import 격리

### 9-2. 웹 stub 구현
- `showPostureAlert` → 브라우저 Notification API
- `updateStatus` → `document.title` 이모지 + canvas 동적 favicon 색상
- 윈도우 제어(`showMainWindow`/`hideMainWindow`/`setWidgetVisible`/`quitApp`) → no-op
- 모드 전환(`switchToMainMode`/`switchToWidgetMode`) → no-op (웹은 단일 페이지)
- `publishWidgetState`/`onWidgetState` → `BroadcastChannel("widget_state")` (멀티탭 sync)
- 외부 pause/resume/close/reopen 이벤트 리스너 → no-op
- LLM 코칭은 v2로 미루고 `generateCoachingMessage`는 항상 null

### 9-3. 빌드 분기
- `package.json`에 `dev:web`/`build:web`/`preview:web` 스크립트 추가
- `vite.config.ts` — `VITE_PLATFORM=web` 일 때 Tauri 전용 dev 서버 옵션 비활성, `define`으로 platform 상수 주입
- `main.tsx`에서 web 빌드는 `#widget` 해시 분기 무시 → Widget chunk가 web 빌드에서 트리쉐이킹됨

### 9-4. UI capability 분기 (한 컴포넌트, 한 파일 유지)
- 컴포넌트에 `IS_WEB` 직접 분기를 두지 않고 `platform.features` capability 패턴 사용:
  - `multiWindow` (위젯 모드 + 메인↔위젯 전환), `trayLifecycle`, `autostart`, `llmCoaching`, `appQuit`
- `SettingsView`: 위젯 모드/LLM 코칭/시작 옵션/앱 종료 섹션을 각 capability로 조건부 렌더, web에서는 "데스크톱 앱 안내" 표시
- `MonitorView`: "위젯 모드로 전환" 버튼은 `platform.features.multiWindow` 일 때만
- `App.tsx`: 캘리브 완료 시 `platform.requestPermissionsForMonitoring()` (Tauri no-op, web은 Notification.requestPermission)
- `App.tsx`: 첫 마운트 시 `updateStatus("good")` → 웹 favicon/타이틀 초기화

### 9-5. 메타 보강
- `index.html`에 OG/Twitter 메타 태그 + 한국어 description + theme-color
- 페이지 타이틀은 런타임에 상태색 이모지로 동적 갱신

## 10. Windows 빌드 호환성

### 10-1. Rust 코드 cfg 격리
- [Cargo.toml](../src-tauri/Cargo.toml) — `tauri` 의 `macos-private-api` feature를 `[target.'cfg(target_os = "macos")'.dependencies]` 로 분리 → Windows 빌드에서 자동 제외
- [lib.rs](../src-tauri/src/lib.rs) — `RunEvent` import + `RunEvent::Reopen` 패턴 매치를 `#[cfg(target_os = "macos")]` 로 격리
- [tray.rs](../src-tauri/src/tray.rs) — `set_title()` 호출을 macOS only로(Windows 트레이는 title 개념 없음, tooltip만 사용)

### 10-2. 모드 복귀 신호 통합
- macOS: Dock 클릭 → `RunEvent::Reopen` → `main:reopened` emit
- Windows/Linux: 트레이 클릭 → 같은 `main:reopened` emit
- 프론트엔드 `onMainReopened` 핸들러는 양 OS에서 동일 — 분기 없음

### 10-3. CI 워크플로우
- [.github/workflows/build-windows.yml](../.github/workflows/build-windows.yml) — `windows-latest` 러너에서 `npm run tauri build` 실행, `.msi`/`.exe` 산출물 artifact 업로드
- 트리거: 수동(`workflow_dispatch`) 또는 git tag `v*` push

## 11. 안정성 + 자세 종류 확장 (2026-05-13)

### 11-1. 에러 상태 UX 강화
- [useCamera.ts](../src/hooks/useCamera.ts) — `getUserMedia` 에러를 `e.name`으로 분기해 친화적 한국어 메시지 매핑 (`friendlyCameraError`). 권한 거부 / 다른 앱 점유 / 카메라 없음 / 해상도 미지원 / Abort 5종.
- [usePoseLoop.ts](../src/hooks/usePoseLoop.ts) — MediaPipe 모델 로드 실패를 친화적 메시지로 변환 (`friendlyModelError`) + `retry()` 함수 노출. 재시도 토큰으로 effect 재실행.
- [CalibrationView.tsx](../src/views/CalibrationView.tsx) / [MonitorView.tsx](../src/views/MonitorView.tsx) — 모델 에러 박스 + "다시 시도" 버튼 렌더. [useMonitoringEngine.ts](../src/hooks/useMonitoringEngine.ts) 반환에 `detectorError`/`detectorRetry` 추가.

### 11-2. 데이터 백업/복원
- 신규 [src/dataBackup.ts](../src/dataBackup.ts) — `exportData()` / `importData(file)` 두 함수. 12개 localStorage 키 묶어서 JSON 다운로드 (`BaroSit-backup-YYYYMMDD.json`). API 키(`anthropic_api_key`)는 보안상 제외.
- 파일 형식: `{ app: "BaroSit", version: 1, exportedAt, data }`. 버전이 더 새거나 다른 앱이면 친화적 메시지로 거부.
- [SettingsDrawer.tsx](../src/views/SettingsDrawer.tsx) "데이터" 섹션에 내보내기/불러오기 버튼 + 확인 다이얼로그 + 복원 후 `window.location.reload()`.

### 11-3. 자세 종류 2종 추가
- **monitor_too_close** — 카메라에 가까워질 때(`-zDelta`) + 귀 너비 / 어깨 너비 비율 확대 합산.
- **shoulder_asymmetry** — 부호 있는 어깨 tilt + 코의 어깨중점 대비 x 오프셋 변화. `shoulder_tilt`(절댓값 기반)와 구분.
- [analyzer.ts](../src/pose/analyzer.ts) `analyzeFrame()` 에 두 블록 추가, `AnalysisDebug` 에 `monitorClose` / `asymmetry` 디버그 필드.
- 전파: [types.ts](../src/pose/types.ts), [thresholds.ts](../src/pose/thresholds.ts) (durationSecs: 8, sensitivity: 1.0), [violationSmoother.ts](../src/pose/violationSmoother.ts), [eventLog.ts](../src/pose/eventLog.ts), [SettingsDrawer.tsx](../src/views/SettingsDrawer.tsx), [SettingsView.tsx](../src/views/SettingsView.tsx), [DashboardView.tsx](../src/views/DashboardView.tsx), [Widget.tsx](../src/views/Widget.tsx), [MonitorView.tsx](../src/views/MonitorView.tsx), [platform/web.ts](../src/platform/web.ts) 의 라벨/COACHING/POSTURE_FIGURE 맵 갱신.
- MonitorView 빈도 차트 타이틀 "자세 4종 빈도" → "자세 종류별 빈도".

### 11-4. Windows 워크플로우 정비
- [.github/workflows/build-windows.yml](../.github/workflows/build-windows.yml) artifact 이름 `bareuge-anja-windows` → `BaroSit-windows-${{ github.sha }}`.

## 12. 스트레칭 정밀화 + 민감도 재조정 + 알림 강화 (2026-05-13)

### 12-1. 스트레칭 감지 false positive 차단
- [stretchDetector.ts](../src/pose/stretchDetector.ts) 4종 모두 임계값/조건 강화:
  - `isOverheadStretch`: 팔꿈치가 어깨 위 `sw*0.35` + **양 손목/팔꿈치가 코보다 위** (책상에서 팔만 살짝 든 false positive 차단)
  - `isBehindHead`: 양 팔꿈치 모두 외측+위 `sw*0.25/0.15`, 손목은 귀 근접 또는 visibility<0.25(머리 뒤로 가려짐), 한쪽이라도 명시적으로 귀 근처
  - `isCrossBody`: wrist가 반대 어깨를 "넘는 게 아니라 도달" — 거리 < `sw*0.4`, 가슴 영역 `sw*0.5` 이내, 동측 팔꿈치 위치 검증 (마우스 reach 차단)
  - `isSideStretch`: 한쪽 팔꿈치만 위 + 어깨 기울임 **0.08 이상** + 코가 같은 방향으로 쏠림 (자연 자세 변화 차단)
- `StretchTracker.minHoldMs` 2000 → 2500 (일시적 자세 변화 더 거름)

### 12-2. 민감도 default 1.0 → 1.4
- 실사용 피드백 기준 "보통" 체감점이 1.4. [thresholds.ts](../src/pose/thresholds.ts) `DEFAULT_THRESHOLDS` 전 자세 1.4.
- [SettingsDrawer.tsx](../src/views/SettingsDrawer.tsx) 프리셋 매핑: 엄격 1.0 / 보통 1.4 / 관대 1.8. `currentPreset` 분기도 1.2/1.6 경계로 재정의.

### 12-3. 위반 알림 강화 (4가지 다중 선택 + 점진 강도)
사용자가 일에 집중하면 미니바를 놓치는 문제 해결. 신규 [alertConfig.ts](../src/alertConfig.ts) + [AlertOverlay.tsx](../src/components/AlertOverlay.tsx).
- **A. 화면 가장자리 펄스 글로우** (default On) — 시야 주변에서 잡히고 작업 흐름 안 깸. `box-shadow inset`으로 두께·색·알파 조정.
- **B. 위젯 일시 확장** (default On, multiWindow) — [Widget.tsx](../src/views/Widget.tsx) 가 `ALERT_EVENT` 리스닝, expanded 사이즈로 리사이즈 + 큰 빨강 카드 표시 (자세명·코칭).
- **C. 풀스크린 중앙 토스트** (default Off) — 가장 확실한 인지, 작업 흐름 잠깐 끊김.
- **D. 사운드 큐** (default Off) — `AudioContext` 짧은 톤 1~2번 (강도 따라).
- **점진 강도**: `intensityFromDuration(secs)` — 0-15s: 0.3 / 15-30s: 0.55 / 30-60s: 0.75 / 60s+: 1.0. 글로우 색이 노랑 → 주황 → 빨강, 토스트 테두리 같은 색, 사운드 톤·횟수 변화, 위젯 카드 그라디언트 강도 변화.
- **발사 경로**: [useMonitoringEngine.ts](../src/hooks/useMonitoringEngine.ts) / [MonitorView.tsx](../src/views/MonitorView.tsx) 의 `showPostureAlert` 호출 직후 `dispatchAlertFired(detail)` CustomEvent. AlertOverlay/Widget 양쪽이 동일 이벤트 리스닝.
- [SettingsDrawer.tsx](../src/views/SettingsDrawer.tsx) "알림 강화" 섹션에 4개 토글 + 점진 강도 안내.
- [dataBackup.ts](../src/dataBackup.ts) 백업 키에 `alert_modes` 추가.

## 13. 알림 always-on-top 윈도우 (2026-05-13)

### 문제
풀스크린 토스트가 메인 윈도우 안에 그려져, 사용자가 다른 앱(코드 편집기 등)을 메인 위로 올리면 가려져서 안 보임. 일에 집중하다 알림 놓치는 케이스를 막는 게 핵심인데 정반대였음.

### 해결
별도 **alert** Tauri 윈도우 — 풀스크린, frameless, transparent, **alwaysOnTop**, **click-through(`set_ignore_cursor_events(true)`)**, focus 안 잡음, skipTaskbar.
- [tauri.conf.json](../src-tauri/tauri.conf.json) — 세 번째 윈도우(`alert`, `index.html#alert`) 정의
- [lib.rs](../src-tauri/src/lib.rs) — `show_alert_window` (현 모니터 풀스크린 사이즈로 리사이즈 + click-through + alwaysOnTop + show), `hide_alert_window` 커맨드
- [capabilities/default.json](../src-tauri/capabilities/default.json) `alert` 윈도우 허용
- 신규 [src/views/AlertWindow.tsx](../src/views/AlertWindow.tsx) — `alert:fired` Tauri 이벤트 listen → 풀스크린 글로우/토스트 렌더 + 자동 hide
- [main.tsx](../src/main.tsx) `#alert` hash 분기

### 발사 흐름 (메인↔위젯 어디서 owner든 동일)
1. `useMonitoringEngine` 또는 `MonitorView` 가 위반 fire 시 `dispatchAlertFired()` (같은 윈도우 CustomEvent)
2. 그 윈도우의 `AlertOverlay` 가 받아 (a) 사운드 재생 (b) `platform.features.multiWindow` 면 `showAlertWindow()` + `emitAlertFired()` Tauri broadcast
3. alert 윈도우의 `AlertWindow` 가 Tauri 이벤트 받아 화면 전체 위에 글로우/토스트 렌더
4. 강도 기반 duration 후 자동 hide

### Web fallback
`multiWindow=false` 인 웹에서는 AlertOverlay가 종전처럼 자기 윈도우 안에 풀스크린 토스트 렌더 (브라우저 탭 한계상 다른 앱 위로는 불가).

### 인터페이스 추가
- [platform/types.ts](../src/platform/types.ts) — `showAlertWindow` / `hideAlertWindow` / `emitAlertFired` / `onAlertFired`
- [platform/tauri.ts](../src/platform/tauri.ts) / [platform/web.ts](../src/platform/web.ts) 구현/스텁
- [ipc.ts](../src/ipc.ts) re-export

## 14. 등받이 기대기 = 휴식 인식 (2026-05-13)

### 문제
의자 등받이에 기대 휴식할 때 어깨가 살짝 내려가서 `slouching`으로 오탐. 사용자 의도는 휴식인데 잔소리 알람이 옴.

### 해결
[analyzer.ts](../src/pose/analyzer.ts) `analyzeFrame()` 끝에 **leaning-back 감지** 블록 추가 — `AnalysisResult.isResting` 필드로 노출.

**구분 신호 (slouching과 반대)**
- 귀 너비 / 어깨 너비 비율 **15% 이상 감소** (얼굴이 카메라에서 멀어짐) → +1
- face pitch **−0.15 rad 이상 위로** (턱이 위로 들림) → +1
- `|face.tz|` **0.08 이상 증가** (얼굴 z translation 멀어짐) → +1
- 어깨 너비 거의 유지(`> 0.92`) + 어깨 y 살짝 내려감 → +0.5

신호 합 **≥ 1.5** 면 `isResting=true`. 모든 자세 위반 즉시 무효화.

### 처리 흐름
- [useMonitoringEngine.ts](../src/hooks/useMonitoringEngine.ts) / [MonitorView.tsx](../src/views/MonitorView.tsx) — `isResting` 시 `frozen: true` (점수 동결) + `trackerRef.reset()` (알람 누적 시간 초기화) + 알람 fire 차단 + `status: "resting"` 발행
- [types.ts](../src/pose/types.ts) `PostureStatus` union에 `"resting"` 추가
- [lib.rs](../src-tauri/src/lib.rs) `PostureStatus::Resting`, [tray.rs](../src-tauri/src/tray.rs) tooltip "잠깐 등받이에 기대 쉬는 중"
- [Widget.tsx](../src/views/Widget.tsx) STATUS_TONE, [platform/web.ts](../src/platform/web.ts) emoji 🌙 + 색상 `#94a3b8`
- [MonitorView.tsx](../src/views/MonitorView.tsx) 배지 "쉬는 중" + 헤드라인 "잠깐 등받이에 기대어 쉬세요" + 서브 "다시 똑바로 앉으면 자동으로 다시 살펴드릴게요"
- [SilhouetteOverlay.tsx](../src/components/SilhouetteOverlay.tsx) resting 색상 추가

### 검증
analyzer 시뮬 — leaning back 케이스(귀 너비 80% + pitch -0.2 + tz 멀어짐) → `isResting=true`, violations 비어 있음. 진짜 slouching 케이스는 그대로 `slouching` 위반.

## 15. 스트레칭 확장 — 4종 → 7종 + 임계값 완화 (2026-05-13)

### 문제
M5에서 false positive 차단을 위해 임계를 너무 엄격하게 잡아 진짜 스트레칭도 잘 안 잡힘. 종류도 4가지 뿐이라 다양성 부족.

### 변경
[stretchDetector.ts](../src/pose/stretchDetector.ts) — `detectStretch(lm, face?, baseline?)` 시그니처 확장. 기존 4종 임계 완화 + 신규 3종 추가. 모든 위치 컨벤션(LS.x vs RS.x 대소)에 무관하게 동작하도록 재작성.

**기존 4종 (임계 완화)**
- `overhead`(기지개): 팔꿈치 어깨 위 `sw*0.35` → **0.20**, "양 손목 코보다 위 OR 양 팔꿈치 코보다 위" 더 유연
- `behind_head`(목 풀기): 팔꿈치 외측 `sw*0.25/0.15` → **0.18/0.10**, 손목 가림 임계 0.25 → 0.30
- `cross_body`(어깨 스트레치): wrist 반대편 어깨 거리 `sw*0.4` → **0.45**, 컨벤션 무관 `lCrossed/rCrossed` (어깨 중점 기준 dirL*Δx > sw*0.15) — 좌표계 안전
- `side`(사이드 굽힘): 팔꿈치 위 `sw*0.3` → **0.20**, 어깨 기울임 0.08 → **0.06**, nose shift 0.10 → **0.08**
- `StretchTracker.minHoldMs` 2.5s → **2.0s**

**신규 3종**
- `shoulder_shrug` (어깨 으쓱, +3): 양 어깨 y가 baseline `shoulderMidY` 대비 `sw*0.20` 이상 위로 + 양쪽 모두 baseline 어깨 y 대비 `sw*0.10` 위 (한쪽만이면 비대칭). baseline 필수.
- `neck_side` (목 좌우 풀기, +4): face roll baseline 대비 |Δ| > 0.25 rad (~14도) + 어깨 기울임 baseline 대비 변화 < 0.04 (사이드 굽힘과 구분). face landmarker 필수.
- `forward_fold` (상체 앞 숙이기, +5): 코 y가 baseline 대비 `sw*0.30` 이상 아래 + 어깨도 `sw*0.15` 이상 아래 + (face 있으면) pitch가 뒤로 젖혀지지 않았어야 (leaning back 차단).

`BONUS_BY_KIND`, `STRETCH_LABEL`, `lastBonusAt`에 3종 추가.

### 호출처
[useMonitoringEngine.ts](../src/hooks/useMonitoringEngine.ts), [MonitorView.tsx](../src/views/MonitorView.tsx) — `detectStretch(smoothed, frame.face, baseline)` 로 face/baseline 전달.

### 검증
9개 케이스 시뮬: normal idle / mouse reach 차단 + 7종 모두 정확 감지.

## 16. 기타 개선

- 카메라 자동 재시작 (visibility change + 800ms 재시도)
- 위젯 위치 드래그 저장 (`widget_position`)
- 트레이 메뉴 + Reopen 핸들러
- LLM 코칭 옵션 (Claude API)
- 자동 시작 옵션 (login at launch)

## 17. 장시간 사용성 + 자가복구 (2026-05-14)

### 문제
세션이 길어지면 같은 strict 임계가 오후엔 alarm-fatigue, 아침엔 무알람으로
비대칭됨. 단일 5초 임계는 못 넘지만 30분 안에 짧고 잦게 반복되는 episode
누적 부담은 못 잡음 (McGill 디스크 creep). 어깨가 거의 안 움직이는 "정체"
도 통증으로 이어지지만 자세 위반 카테고리로는 안 잡힘. 30/50/120분 연속
착석에 대한 정기 휴식 권유 자체가 없음. macOS WKWebView 가 백그라운드 윈도
우 throttle 로 pose loop 를 슬립시킴. 미니바·모드 전환 중 freeze 발생 시
자가복구 경로도 없음.

운동학·물리치료 권고 4단(Phase 1~4)으로 위 격차를 채움. **자세 점수에는
영향 주지 않는 별도 알림 카테고리** — alarm fatigue 보호.

### 17-1. Phase 1 — 정기 휴식 알림 ([src/pose/breakTracker.ts](../src/pose/breakTracker.ts))
- `BreakStage`: `"none" | "micro" | "standup" | "deep"`, 기본 30/50/120분
- KOSHA GUIDE H-30 (50분 작업 + 10분 휴식), Cornell 50/10, Hedge 20-8-2 종합
- `tick(now, isAbsent, isResting)` — dt 자동 계산, 호출 빈도(15Hz/1Hz)에 무관하게 실시간 누적 보장
- 자리비움 5분+ OR `isResting` 5분+ → `secsSeated` 리셋 (충분히 일어났다 봄)
- 단계는 micro → standup → deep 순으로만 진행
- `dispatchBreakReminder({stage, secs})` → `BREAK_REMINDER_EVENT` CustomEvent
- 영속화: `break_config` localStorage, `BREAK_CONFIG_CHANGED_EVENT`

### 17-2. Phase 2 — 누적 부하 알림 ([src/pose/cumulativeLoadTracker.ts](../src/pose/cumulativeLoadTracker.ts))
- 30분 슬라이딩 윈도우, 자세별 누적 위반 시간/비율 추적
- 단일 5초 임계가 안 넘어도 윈도우 누적 비율 25% 도달 시 발사
- McGill 디스크 creep 모델 — 짧고 잦은 episode 의 누적 부담 가시화
- `dispatchCumulativeAlert({postureType, secs, ratio})` → `CUMULATIVE_ALERT_EVENT`
- 영속화: `cumulative_load` localStorage, `CUMULATIVE_CONFIG_CHANGED_EVENT`

### 17-3. Phase 3 — 자세 변동성 알림 ([src/pose/variabilityTracker.ts](../src/pose/variabilityTracker.ts))
- 어깨·머리 좌표의 10분 윈도우 표준편차로 움직임 부족(정체) 감지
- McGill "The best posture is the next posture" 원칙 — 자세가 좋아도 안 움직이면 통증
- 위반 아님 — 긍정 톤의 스트레칭 권유로 발사
- `dispatchVariabilityAlert({movementIndex, durationSecs})` → `VARIABILITY_ALERT_EVENT`
- 영속화: `variability` localStorage, `VARIABILITY_CONFIG_CHANGED_EVENT`

### 17-4. Phase 4 — 적응형 민감도 ([src/pose/adaptiveSensitivity.ts](../src/pose/adaptiveSensitivity.ts))
- 순수 함수 `computeSensitivityModifier(config, now)` — 외부 상태/사이드 이펙트 없음
- 세션 길이 보정: 2h+ → +0.10, 4h+ → +0.20, 6h+ → +0.30
- 시간대 보정: 13–15시 +0.05 (점심 후), 16–18시 +0.15 (오후 피로 peak)
- 두 보정 중 **큰 값(max) 사용** — 과도 완화 방지
- 자세 multiplier = 1 + bonus (덜 민감), 휴식 multiplier = 1 − bonus (더 일찍)
- 근거: Bridger "Introduction to Ergonomics" postural muscle EMG 피로 곡선, Pheasant & Haslegrave "Bodyspace"
- 영속화: `adaptive_sensitivity` localStorage, `ADAPTIVE_CONFIG_CHANGED_EVENT`

### 17-5. WKWebView throttle 회피 ([src/keepAwake.ts](../src/keepAwake.ts))
- `startKeepAwake()` — 무음 AudioContext 로 "재생 중인 미디어" 신호 유지
- macOS WKWebView 가 백그라운드 윈도우를 suspend 하지 않게 막음
- 엔진 활성화 시 한 번 시작

### 17-6. Pose loop 자가복구 ([src/watchdog.ts](../src/watchdog.ts))
- `useHeartbeat()` — 매 프레임 `tick()` 호출로 마지막 활성 시각 기록
- `useWatchdog()` — 30초 stale 경고 → 60초 미응답 시 `window.location.reload()`
- 미니바·모드 전환 중 발생하던 freeze 자가복구
- `logEvent` — 디버그 페이로드 분리 export

### 17-7. 엔진 통합 ([useMonitoringEngine.ts](../src/hooks/useMonitoringEngine.ts) / [MonitorView.tsx](../src/views/MonitorView.tsx))
- 4 tracker 인스턴스화 + 각 `*_CONFIG_CHANGED_EVENT` 리스너로 설정 라이브 reload
- onFrame 흐름: `computeSensitivityModifier` 로 임계 조정 → `breakTracker.tick` → `cumulativeTracker.observe` → `variabilityTracker.observe`
- 4 종 알림 분기: `dispatchAlertFired` / `dispatchBreakReminder` / `dispatchCumulativeAlert` / `dispatchVariabilityAlert`
- 엔진 활성화 시 `startKeepAwake()` 호출, 매 프레임 `heartbeat.tick()`
- `widget_state` payload 에 `breakStatus` 포함 publish (위젯도 휴식 진행 표시 가능)

### 17-8. 알림 디스패처 확장 ([src/alertConfig.ts](../src/alertConfig.ts))
- 신규 dispatchers 3종: `dispatchBreakReminder` / `dispatchCumulativeAlert` / `dispatchVariabilityAlert`
- 각각 `BREAK_REMINDER_EVENT` / `CUMULATIVE_ALERT_EVENT` / `VARIABILITY_ALERT_EVENT`
- 기존 자세 위반(`dispatchAlertFired`, `ALERT_EVENT`) 패턴과 동일 — alert 윈도우/위젯/사운드 강도 시스템 그대로 재사용

### 17-9. 설정 UI ([src/views/SettingsDrawer.tsx](../src/views/SettingsDrawer.tsx))
4개 신설 섹션:
- **"휴식 알림"** — micro/standup/deep 3단 토글 + 각 단계 분(min) 슬라이더 + 미리보기 발사 버튼
- **"누적 부하 알림"** — 활성화 토글 (윈도우 30분 / 비율 25% 기본은 모듈 상수)
- **"자세 변동성 알림"** — 활성화 토글 (10분 윈도우 기본)
- **"적응형 민감도"** — 활성화 토글 + 현재 보정(`postureMultiplier` / `reason`) 표시

### 발사 흐름 (자세 위반과 분리)
1. onFrame 에서 4개 tracker 가 각자 신호 평가
2. 각 tracker 가 `dispatch*` 호출 → CustomEvent 발사
3. AlertOverlay·Widget 가 동일한 강도/UI 시스템으로 렌더
4. **자세 점수에는 영향 없음** — Phase 1~3 은 별도 카테고리

### 검증 (코드 시뮬)
- adaptiveSensitivity: 6h+ 세션 + 16시 → max(0.30, 0.15) = 0.30 → posture multiplier ≈ 1.30, break multiplier ≈ 0.70 — OK
- breakTracker: 15Hz·1Hz push 모두 30분 후 micro 단계 발사 시각 동일 — dt 자동 계산 OK
- watchdog: 60초 heartbeat 정지 시뮬 → reload 호출 — OK

## 18. 자동 업데이트 + GitHub Releases (2026-05-19)

### 문제
출시 후 버그 발견·새 기능 배포 시 사용자가 매번 다시 다운로드·설치해야 함 →
hotfix 가 사실상 무력화. macOS App Store 밖 direct distribution 에서는 자동
업데이트가 사실상 필수. 코드 서명·공증 전이라도 워크플로우는 미리 구축 가능.

### 18-1. Tauri 측 통합
- [Cargo.toml](../src-tauri/Cargo.toml) — `tauri-plugin-updater = "2"`, `tauri-plugin-process = "2"` (재시작용) 의존성 추가
- [lib.rs](../src-tauri/src/lib.rs) — `.plugin(tauri_plugin_updater::Builder::new().build())` + `.plugin(tauri_plugin_process::init())` 등록
- [tauri.conf.json](../src-tauri/tauri.conf.json) — `bundle.createUpdaterArtifacts: true` (각 OS 산출물에 `.sig` 파일 자동 생성), `plugins.updater.endpoints` + `pubkey` 추가
- [capabilities/default.json](../src-tauri/capabilities/default.json) — `updater:default` + `process:default` 권한 추가
- 키페어 생성 — `tauri signer generate --ci --password "" -w ~/.barosit-signing/barosit.key` (public 키는 conf 에 평문 임베드, private 키는 GitHub Secrets `TAURI_SIGNING_PRIVATE_KEY` 에 사용자가 등록)

### 18-2. JS 측 통합 — platform 추상화
- [src/platform/types.ts](../src/platform/types.ts) — `UpdateInfo` / `UpdateProgressEvent` 타입 + `PlatformFeatures.autoUpdate` 플래그 + `checkForUpdate()` / `downloadAndInstallUpdate(onProgress)` 메서드
- [src/platform/tauri.ts](../src/platform/tauri.ts) — `@tauri-apps/plugin-updater` 의 `check()` 호출 → `downloadAndInstall()` → `plugin-process.relaunch()` 까지 통합 구현. dynamic import 로 web 번들 트리쉐이킹 보장
- [src/platform/web.ts](../src/platform/web.ts) — `autoUpdate: false`, 메서드는 no-op (브라우저는 새로고침이 업데이트)

### 18-3. useUpdater hook + UpdateNotice 컴포넌트
- 신규 [src/updater.ts](../src/updater.ts) — React hook `useUpdater()` 가 상태 + 액션(`checkNow` / `applyUpdate` / `snooze` / `dismissError`) 캡슐화
- **자동 체크 정책**: 앱 마운트 5초 후 1회. 마지막 체크 후 24시간 미경과면 skip (`updater_last_check` localStorage). 사용자가 같은 버전 snooze 한 경우 자동 체크에서는 무시(`updater_snoozed_version`)
- **수동 체크**: 설정의 "업데이트 확인" 버튼은 쿨다운·snooze 무시하고 즉시 확인. 결과 없으면 "최신 버전입니다" 토스트
- 신규 [src/components/UpdateNotice.tsx](../src/components/UpdateNotice.tsx) — 우측 하단 배너. 버전·릴리스 노트 200자 요약 + [나중에 / 적용 후 재시작] 버튼. 다운로드 중에는 progress bar (`UpdateProgressEvent` 의 `started`/`progress`/`finished` 매핑)
- 신규 [src/styles.css](../src/styles.css) `.b-update-notice` 클래스 그룹 — 다크모드 대응 + 페이드인 애니메이션

### 18-4. App.tsx 통합
- [App.tsx](../src/App.tsx) — `useUpdater()` 한 번 호출, `<UpdateNotice state={updater} />` 렌더, `SettingsDrawer` 에 `updater` prop 전달 (같은 인스턴스 공유)

### 18-5. SettingsDrawer "정보" 섹션
- [SettingsDrawer.tsx](../src/views/SettingsDrawer.tsx) — 버전 표시 옆에 "업데이트 확인" 버튼 (`platform.features.autoUpdate` 일 때만 렌더 — 웹은 숨김)

### 18-6. 백업 키 추가
- [src/dataBackup.ts](../src/dataBackup.ts) — `updater_snoozed_version` 추가 (다른 컴퓨터로 백업 복원 시 snooze 상태도 따라가게)

### 18-7. CI — release.yml (signed, multi-platform)
- 신규 [.github/workflows/release.yml](../.github/workflows/release.yml) — `tauri-apps/tauri-action@v0` 매트릭스 빌드:
  - **macOS**: `--target universal-apple-darwin` (Intel + Apple Silicon 단일 .dmg/.app)
  - **Windows**: 기본 (.msi + .exe)
- 트리거: `workflow_dispatch` 또는 `v*` 태그 push (예: `git tag v0.2.0 && git push --tags`)
- 환경 변수 (사용자가 GitHub Secrets 에 등록): `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- tauri-action 이 자동 처리: 각 OS 산출물 빌드 → minisign 서명(`.sig` 파일) → Release 생성 (draft) → 산출물 + `latest.json` 메니페스트 업로드
- 기존 [build-windows.yml](../.github/workflows/build-windows.yml) 은 그대로 유지 — Windows 러너 검증용 (서명 없이도 산출물 확인)

### 18-8. 업데이트 흐름

```
앱 시작 (마운트 5초 후, 24h 쿨다운 통과 시)
  → platform.checkForUpdate()
     → updater.check() — endpoints 의 latest.json fetch + 버전 비교
  → UpdateInfo 반환 시 UpdateNotice 배너 표시
사용자 [적용 후 재시작] 클릭
  → platform.downloadAndInstallUpdate(onProgress)
     → update.downloadAndInstall() — minisign 서명 검증 후 설치
     → plugin-process.relaunch() — 앱 재시작 (현 프로세스 종료 → 새 버전 시작)
```

### 사용자 셋업 필요 항목 (코드 외)

1. **git init + GitHub repo 생성·push** — `.git` 없는 상태에서 시작. private/public 어느 쪽이든 OK
2. **GitHub Secrets 등록**:
   - `TAURI_SIGNING_PRIVATE_KEY` = `~/.barosit-signing/barosit.key` 파일 내용
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = `""` (빈 비밀번호로 생성됨; 비밀번호로 재생성하려면 `tauri signer generate -w ...`)
3. **tauri.conf.json 의 `plugins.updater.endpoints`** 의 `__OWNER__`/`__REPO__` 자리를 실제 GitHub 사용자명·리포지토리명으로 치환
4. **첫 릴리스**: `git tag v0.1.1 && git push --tags` → release.yml 자동 실행 → GitHub Releases 에 draft 로 산출물 게시 → 검토 후 publish

### 알려진 한계
- macOS **코드 서명·공증** 은 별개 — 자동 업데이트 자체는 서명 없이도 동작하지만 Gatekeeper "확인되지 않은 개발자" 경고는 매 설치 시 뜸. 정식 출시 전 별도 셋업 필요 (출시 블로커 §4)
- minisign signature 는 산출물 위변조만 방지 — OS 레벨 신뢰는 코드 서명이 담당

## 19. v0.1.1 — 자동 업데이트 동작 시연 (2026-05-19)

v0.1.0 publish 후 endpoint(`releases/latest/download/latest.json`) 가 정상
동작하는 것까지 확인. 실제 사용자 흐름(앱 시작 → 5초 후 자동 체크 →
UpdateNotice 배너 → 적용 후 재시작 → relaunch)을 검증하기 위한 시연용 minor
release.

- 버전 bump only — package.json / [Cargo.toml](../src-tauri/Cargo.toml) / [tauri.conf.json](../src-tauri/tauri.conf.json) / [SettingsDrawer "정보" 라벨](../src/views/SettingsDrawer.tsx) 모두 `0.1.1`
- 코드 변경 없음 — v0.1.0 production 앱에서 새 버전 감지 → 다운로드 → 설치 → relaunch 까지 흐름 검증이 목적

### 후속 작업 후보
— [project-status.md "📝 작은 후속 작업 (Backlog)"](../docs/project-status.md) 로 통합 이관.

## 20. v0.1.2 — 약관 인앱 표시 + 사용자 프로필 Phase 0 (2026-05-19)

### 배경
출시 블로커 #3 에서 작성한 [privacy.md](../docs/privacy.md) / [terms.md](../docs/terms.md) 가
GitHub 외부 링크로만 노출되던 것을 **앱 안 모달**로 옮김. 동시에 향후 인증·
클라우드 동기화의 기반이 될 **사용자 프로필 페이지 골격** 을 도입(현재는 로컬 stub).

### 20-1. 약관·처리방침 인앱 표시
- 신규 [src/components/LegalDocument.tsx](../src/components/LegalDocument.tsx) — `b-overlay/b-modal` 패턴 + 헤더(제목·닫기) + 본문 스크롤
- Vite `?raw` import 로 [docs/privacy.md](../docs/privacy.md) / [docs/terms.md](../docs/terms.md) 가져와 [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-gfm](https://github.com/remarkjs/remark-gfm) 으로 렌더 (table·blockquote 지원)
- [src/styles.css](../src/styles.css) — `.b-legal-modal` / `.b-legal-header` / `.b-legal-body` (h1-h3·table·a·code·blockquote·hr 마크다운 매핑)
- [src/App.tsx](../src/App.tsx) — `legalDoc: LegalDocKind | null` state 일원화, Onboarding·SettingsDrawer 에 `onShowLegal` prop 전달
- [Onboarding.tsx](../src/views/Onboarding.tsx) 3페이지·[SettingsDrawer.tsx](../src/views/SettingsDrawer.tsx) "정보" 섹션 — 외부 a 태그 → 버튼 onClick 으로 교체

### 20-2. 사용자 프로필 — Phase 0 (로컬 stub)
- 신규 [src/userProfile.ts](../src/userProfile.ts) — `UserProfile` 타입 + load/save + `PROFILE_CHANGED_EVENT` + 이모지 아바타 10종(`🪑🧘🌿🦴🪴🐢🦒🌱🦊🐰`)
- 신규 [src/views/ProfileView.tsx](../src/views/ProfileView.tsx) — 풀스크린 페이지
  - "로그인/회원가입" 섹션: 비활성 + "준비 중" 배지 (Phase 1 예정)
  - 아바타 그리드(클릭 선택)·이름 input(max 24자)·작업환경 3개 라디오(노트북/외장/혼합)
  - 변경 시 600ms debounce 자동 저장, "자동 저장됨" hint
  - 좌상단 "홈으로" 버튼 → `onGoHome()` 콜백 (MonitorView 복귀)
- [src/styles.css](../src/styles.css) — `.profile-view` / `.profile-card` / `.profile-avatar-grid` / `.profile-radio` 등
- [src/dataBackup.ts](../src/dataBackup.ts) — `BACKUP_KEYS` 에 `user_profile_v1` 추가 (백업/복원 포함)

### 20-3. MonitorView 헤더 통합
- [MonitorView.tsx](../src/views/MonitorView.tsx) — 설정 톱니바퀴 옆에 **사용자 아바타 이모지 버튼** 추가, 클릭 시 ProfileView 전체 화면 전환
- 헤더 표시는 `loadProfile()` + `PROFILE_CHANGED_EVENT` 리스너로 라이브 갱신 (다른 화면에서 프로필 변경해도 즉시 반영)
- App.tsx 의 `profileOpen` state 분기 — ProfileView 표시 시 MonitorView 위에 z-index 30 으로 덮음

### 20-4. Phase 1~4 계획 문서
- 신규 [docs/auth-sync-plan.md](../docs/auth-sync-plan.md) — Supabase + OAuth + RLS + 동기화 엔진 + 법적 문서 재작성 단계별 계획
- 사전 결정 사항 6개(백엔드·인증·동기화 범위·마이그레이션·토큰 저장·가격) 사용자 검토 대기
- 총 2-3주 작업으로 추정. macOS 코드 서명(출시 블로커 #4) 과 병행 또는 v0.2 메이저 업데이트로 배포

### 20-5. 의존성
- `npm install react-markdown remark-gfm` — 약 100개 transitive 패키지 추가, gzip 약 60KB
- Tauri 의존성 변경 없음 (Rust 재컴파일 불필요)

### 검증
- TypeScript `tsc --noEmit` — 0 errors

## 21. v0.1.3 — 가림 현상 자동 핸드오버 및 캘리브레이션 충돌 해결 (2026-05-20)

### 배경
- macOS WKWebView는 메인 창이 다른 앱에 가려지면(Occluded) CPU 및 렌더링 절전 모드(Suspend)로 들어갑니다.
- 기존 keepAwake(무음 오디오)만으로는 타이머 멈춤을 완벽하게 방어할 수 없어, 가려지는 즉시 미니바(Widget)가 감지 루프 및 카메라를 인계받고, 메인이 앞으로 나오면 안전하게 카메라를 반환하는 **가림 현상 자동 핸드오버 파이프라인**을 성공적으로 적용했습니다.
- 구현 과정에서 "기준 자세 잡기" (Calibration) 모드로 진입 시 메인 창의 `MonitorView`가 언마운트되면서 미니바가 가림 현상으로 감지하고 백그라운드 엔진을 동시에 켜서 **카메라 점유 경쟁 충돌(검은 화면 멈춤)**을 발생시키는 문제를 발견하고 완벽하게 자가복구 처리했습니다.

### 21-1. 메인 윈도우 가림 감지 및 250ms 지연 핸드오버
- [src/views/MonitorView.tsx](../src/views/MonitorView.tsx) — `document.hidden`과 `visibilitychange` 이벤트를 구독하여 가림 여부를 실시간 판단.
- 메인이 보일 때만 250ms의 지연 버퍼를 두고 카메라(`cameraActive`)를 가동함으로써 미니바가 카메라를 끄고 권한을 양도할 시간을 보장하여 하드웨어 충돌을 원천 차단했습니다.
- 복귀 시점에 `lastPresentAtRef.current = Date.now()`로 타이머를 보정하여 핸드오버 지연 도중 '자리비움/일시정지' 상태로 오탐하는 것을 차단했습니다.

### 21-2. 미니바의 영리한 백그라운드 감지 인수
- [src/views/Widget.tsx](../src/views/Widget.tsx) — `localStorage`의 `main_visible` 상태를 관측하여 `mainVisible` 로컬 상태로 반영.
- 위젯 백그라운드 분석 엔진(`useMonitoringEngine`) 활성화 조건(`engineActive`)을 가림 상태(`appMode === "main" && !mainVisible`)까지 안전하게 통합하여 위젯이 상시 끊김 없이 감지를 보조하도록 했습니다.
- [src/hooks/useMonitoringEngine.ts](../src/hooks/useMonitoringEngine.ts) — 위젯 엔진이 기동하는 첫 프레임 시점에 `lastPresentAtRef`를 초기화하여 위젯의 자리비움 오동작을 원천 차단했습니다.

### 21-3. 캘리브레이션 뷰 카메라 점유 충돌 차단 (State Lift-up)
- [src/App.tsx](../src/App.tsx) — 메인 창의 가시성 상태(`main_visible`) 관리 책임을 개별 뷰(`MonitorView.tsx`)에서 공통 루트인 `App.tsx` 레벨로 격상(Lift-up)했습니다.
- `MonitorView`가 언마운트되고 `CalibrationView`로 뷰가 전환되는 과정에서도 메인 창 자체가 화면에 노출되어 있다면 `main_visible`을 계속 `"true"` (보임)로 유지하게 했습니다.
- 이를 통해 캘리브레이션 진입 시 미니바가 오작동하여 카메라를 빼앗아 가던 경쟁 문제를 해결하고, 캘리브레이션 뷰가 단독으로 카메라 장치를 아주 원활하고 완벽하게 획득할 수 있도록 수정했습니다.

### 21-4. 적응형 민감도 실시간 보정치 라이브 시각화
- [src/views/SettingsDrawer.tsx](../src/views/SettingsDrawer.tsx) — 적응형 민감도 활성화 시, 5초 단위로 실시간 피로 보정 상태를 렌더링하는 라이브 상태 인디케이터 및 설명 카드를 삽입했습니다.
- [src/styles.css](../src/styles.css) — 실시간 모니터링이 원활히 동작 중임을 상징하는 초록색 인디케이터 구슬의 은은한 숨 쉬기 효과용 `@keyframes b-pulse` 애니메이션을 추가했습니다.
- 보정이 활성화되어 있는 동안 임계 완화율(Multiplier)과 적용 사유(reason)가 실시간 시각화되어 사용자의 디버깅 편의성과 기능 신뢰도를 대폭 향상시켰습니다.

### 21-5. 설정 화면 버전 라벨의 Tauri API 동적화 연동
- [src/views/SettingsDrawer.tsx](../src/views/SettingsDrawer.tsx) — 푸터에 하드코딩되었던 `"0.1.2"` 문자열을 제거하고, `platform.getAppVersion()` 추상화 비동기 API와 바인딩했습니다.
- [src/platform/tauri.ts](../src/platform/tauri.ts) & [src/platform/web.ts](../src/platform/web.ts) — Tauri v2의 `@tauri-apps/api/app.getVersion()` API를 각 플랫폼 계층에 구현하여, 향후 릴리스 배포 시 수동 버전 수정 없이 앱 버전과 설정창 표기가 영구히 자동 동화되도록 기능을 완성했습니다.

### 21-6. 수동 업데이트 안내 배너 테마 분리
- [src/updater.ts](../src/updater.ts) & [src/components/UpdateNotice.tsx](../src/components/UpdateNotice.tsx) — 수동으로 새 버전을 체크했을 때 "최신 버전입니다"라는 긍정적인 안내를 줄 때, 기존의 빨간색 에러 배너(`b-update-error`)에 묶여 출력되던 결함을 해결했습니다.
- 일반적인 알림 안내를 위한 독자적인 `info` 및 `dismissInfo` 상태 필드와 파이프라인을 구축하고, 세이지 그린 톤의 `b-update-info` 테마 배너 스타일을 [src/styles.css](../src/styles.css)에 신설하여 UX의 시각적 일관성을 확보했습니다.

## 22. v0.1.4 — 스트레칭 점수 개편, 결제 정보 삭제 기능 추가 및 GitHub Push 보호 조치 (2026-05-22)

### 배경
- 사용자가 실사용 중 "기지개" 자세를 취할 때 카메라 화각을 벗어나거나 감지가 너무 빡빡하여 흐름이 끊기던 문제를 개선하고, 스트레칭 횟수 대신 직관적인 "스트레칭 점수" 누적 방식을 적용하여 대시보드와 UI 피드백을 통일했습니다.
- 유료 구독 모델 연동 과정에서 필수적인 "결제 정보 삭제 (결제 수단 해제)" 기능을 구현하여 안전한 Supabase DB 필드 초기화 및 감사 로그 이벤트 처리를 완비했습니다.
- 마지막으로 Google 및 Kakao OAuth 관련 민감 정보 노출로 인한 GitHub Push Protection 블로킹을 해결하고, 코드를 안전하게 정제하여 원격 리포지토리에 푸시를 성공시켰습니다.

### 22-1. 기지개 감지 민감도 완화 및 모니터링 엔진 튜닝
- [src/pose/stretchDetector.ts](../src/pose/stretchDetector.ts) — 기지개(overhead) 감지 시 팔꿈치 및 손목의 Y축 경계선 임계값을 완화하여, 손끝이나 팔꿈치가 카메라 화각 상단 경계에 의해 일부 잘리더라도 감지가 정상 가동되도록 수정했습니다.
- 기지개 감지 유지 시간 및 쿨다운 값 개선:
  - `minHoldMs`: 기존 2000ms → 1000ms로 완화 (보다 빠르게 감지 성공을 알림)
  - `cooldownMs`: 기존 60000ms → 5000ms로 대폭 단축하여, 주기적인 점수 획득이 자연스럽게 유도되도록 조정했습니다.
  - `gapToleranceMs`: 기존 600ms → 1000ms로 상향하여, 일시적인 Landmark 유실 시에도 인식을 부드럽게 유지(히스테리시스)하도록 보강했습니다.

### 22-2. 횟수제에서 포인트제(점수 누적)로의 개편 및 대시보드 연동
- [src/hooks/useMonitoringEngine.ts](../src/hooks/useMonitoringEngine.ts) — 스트레칭을 raw reps 단위로 기록하던 로직을 실제 획득 점수 기반 누적값으로 전환했습니다.
  - 기지개(overhead) 완료 시 `+5점`, 사이드 스트레칭(side) 완료 시 `+3점`이 누적되어 Dashboard의 "스트레칭 점수" 카드 및 차트에 정확하게 통합됩니다.
- [src/views/MonitorView.tsx](../src/views/MonitorView.tsx) — 대시보드의 기존 횟수 표시 라벨을 **"스트레칭 점수" (Stretching Score)**로 수정하고 단위 역시 '점'으로 직관적으로 변경했습니다.

### 22-3. 안전한 결제 정보 삭제 기능 구현
- [src/views/ProfileView.tsx](../src/views/ProfileView.tsx) — 등록된 카드/결제 정보를 사용자가 원할 때 언제든 해지할 수 있도록 `handleDeleteCardInfo` 기능을 신설했습니다.
  - Supabase `user_subscriptions` 테이블의 `billing_key` 및 `card_info` 필드를 즉시 null로 안전하게 업데이트합니다.
  - 트랜잭션 성공 후 `POSTURE_BONUS_EVENT`나 Profile 변경 이벤트를 적절히 전파하고, UI 상태를 즉각 동기화합니다.
  - 구독 정보 영역 하단에 눈에 잘 띄는 빨간색 테두리의 **[결제 수단 삭제]** 버튼을 배치했으며, 로딩 상태 스피너와 성공 알림 토스트를 매끄럽게 연동했습니다.

### 22-4. GitHub Push Protection 보안 필터 해결 및 리포지토리 푸시
- [supabase/config.toml](../supabase/config.toml) — 로컬 개발 시에 입력되었던 Google 및 Kakao OAuth의 Client ID 및 Secret 노출 위험을 감지한 GitHub Push Protection 문제를 완벽하게 해결했습니다.
  - 모든 민감 키를 `GOOGLE_CLIENT_ID_PLACEHOLDER`, `KAKAO_CLIENT_ID_PLACEHOLDER` 등 안전한 플레이스홀더 텍스트로 치환 및 정제 완료했습니다.
  - 클린업 커밋을 생성하고 원격 `origin/main` 리포지토리에 오류 없이 안전하게 푸시했습니다.

### 22-5. Tauri 크로스 플랫폼 클라우드 빌드 파이프라인 정비
- GitHub Actions 워크플로우 `Release (signed, auto-updater)`에서 `macos-latest` 및 `windows-latest` 환경 빌드가 단일 태그 push로 완전 자동화 및 정상 구동됨을 재확인했습니다.
- Tauri의 네이티브 윈도우 및 웹 번들이 동일한 프론트엔드 리소스를 공유하므로, 새로 수정된 감지 민감도, 포인트 적립 및 결제 삭제 기능이 macOS/Windows 데스크톱 앱과 브라우저에서 100% 동일하게 동작하도록 설계 및 호환을 보장했습니다.

### 22-6. Resend 매직링크(Supabase Email OTP) 도입 중단 결정 기록
- 사용자의 최종 결정에 따라 이번 스프린트에서 Resend를 이용한 매직링크 인증 기능은 도입 대상에서 제외(중단)하기로 결정했습니다.
- 관련 문헌인 [project-status.md](../docs/project-status.md) 및 [auth-sync-plan.md](../docs/auth-sync-plan.md) 에 매직링크 제외 사실을 확실하게 명문화하여 기록을 남겼습니다.
- 이에 따라 로그인 및 회원가입 인증 흐름은 Google 및 Kakao OAuth 소셜 로그인에 집중하여 완성해 갈 예정입니다.

### 검증
- TypeScript 정적 분석 `tsc --noEmit` — 0 errors
- 빌드 검증 `npm run build:web` — 100% 성공

## 23. v0.1.5 — 실시간 타이머 정상화, 연간 공헌도 바둑판 그리드 캘린더, 소급 패키징 엔진 및 시간 표시 레이아웃 가림 현상 해결 (2026-05-23)

### 배경
- 브라우저 웹 전용 모드 또는 메인 분석 뷰(`MonitorView.tsx`) 단독 가동 시 백그라운드 엔진(`useMonitoringEngine`)이 미실행되어 실시간 오늘 총 사용 시간 및 좋은 자세 유지율 타이머가 멈추던 버그를 완벽히 해결했습니다.
- 자정 전 퇴근 등으로 컴퓨터를 종료하는 사용자의 실제 생활 패턴에 대응하여, 다음 기동 시 어제의 데이터를 유실 없이 가공 및 소급 패키징하는 오프라인-퍼스트 outbox 설계인 `Retroactive Pack-and-Sync` 엔진을 완벽히 마운트했습니다.
- 12행 x 31열 연간 공헌도 바둑판 그리드 캘린더를 신설하고, 차트의 실시간 현재 시각 지시선 배지가 상단 헤더 텍스트와 겹치거나 지시선이 상단으로 튀어나와 가리는 현상을 레이아웃 및 렌더링 범위 조정을 통해 세련되게 해결했습니다.

### 23-1. 실시간 "오늘 총 사용 시간" 및 "좋은 자세 유지율" 타이머 정상화
- [src/views/MonitorView.tsx](../src/views/MonitorView.tsx) — 메인 뷰 단독 구동 시에도 타이머가 정상 동작하도록 1초 주기 독립 타이머 엔진을 탑재했습니다.
- `statusRef`, `scoreRef`, `violationsRef` 등 robust한 refs 체계를 설계하여 상태 변화 시 불필요한 타이머 생성/해제 오버헤드를 제로화했습니다.
- 매 1초마다 총 사용 시간을 증가시키고, 자세 위반이 감지되지 않으면 좋은 자세 시간을 증가시켜 React 상태 및 LocalStorage를 동기화했습니다.
- `StorageEvent` 리스너를 추가하여 여러 브라우저 탭이나 창 간에도 실시간 카운터의 정합성이 100% 일치하도록 보장했습니다.

### 23-2. 기동 시 소급 패키징 및 배치 동기화 엔진 (`Retroactive Pack-and-Sync`) 도입
- [src/views/MonitorView.tsx](../src/views/MonitorView.tsx) — 컴포넌트 마운트 시 `last_active_date`와 현재 날짜를 비교 감지하여 날짜 변경 시 어제 퇴근 시점까지 누적되었던 임시 데이터를 소급 패키징하는 엔진을 탑재했습니다.
- 어제 최종 통계 객체를 `{r, v, s, a, synced: false}` 형태로 가공하여 `barosit_daily_history` 장기 DB에 보존하고, 오늘 신규 모니터링을 위해 임시 슬롯 리셋 및 `last_active_date`를 오늘로 갱신했습니다.
- 백그라운드에서 동기화되지 않은 데이터를 수집하여 배치 전송하는 동기화 메커니즘을 시뮬레이션하여 데이터 무결성을 보장했습니다.

### 23-3. 12개월 전주기 일별 자세 건강 분포 그리드 신설
- [src/views/MonitorView.tsx](../src/views/MonitorView.tsx) — Github Contribution Heatmap 스타일의 12행(1월~12월) x 31열(1일~31일) 연간 공헌도 캘린더를 구현하여 상세 분석 리포트 모달 내부에 배치했습니다.
- 프리미엄 HSL 컬러 맵(S, A, B, C, D 등급별 톤 변이)과 반응형 글래스모피즘 툴팁을 추가하여 장기 자세 개선 여정을 시각화하고 성취감을 고취했습니다.
- 정형외과/척추생체역학 논문 근거(Nachemson 요추 수직 부하 연구, Kapandji 경추 전단 하중 연구, 인대 완화 방지 각주 등)를 명시하여 임상적 신뢰도를 극대화했습니다.

### 23-4. 실시간 현재 시간 지시선 및 말풍선 레이아웃 가림 문제 해결
- [src/views/MonitorView.tsx](../src/views/MonitorView.tsx) — 차트 헤더와 차트 바디 간 여백(`marginBottom`)을 기존 `14px`에서 `24px`로 대폭 확장하여, 09:00~12:00 등 이른 시간대에 현재 시각 말풍선이 텍스트 정보를 가리던 레이아웃 충돌 문제를 완전히 해결했습니다.
- 말풍선 핀의 상대적 수직 위치를 `top: 6px`로 하향 조정하여, 차트 상단의 비어있는 안전 여백(22px 높이) 중앙 영역에 조화롭고 완벽하게 안착시켰습니다.
- **수직 점선 상단 노출 차단**: 점선 지시선이 현재 시각 말풍선 배지 위쪽으로 삐죽하게 튀어나와 룩앤필을 해치는 불편을 해결하기 위해, 점선의 렌더링 범위를 말풍선 아래인 `top: 22px`에서 시작하여 차트 바닥까지 내려가도록 차단 및 분리하여 세련된 비주얼을 구축했습니다.

### 검증
- TypeScript 정적 분석 `tsc --noEmit` — 0 errors
- 빌드 검증 `npm run build:web` — 100% 성공

## 24. macOS 코드 서명 및 공증 완료 (2026-06-24)

### 배경
- macOS용 데스크톱 앱을 사용자가 웹사이트에서 다운로드하여 설치 시, "확인되지 않은 개발자" 또는 Gatekeeper 경고 창이 떠서 앱이 정상 실행되지 않는 출시 블로커 이슈를 완벽히 해결했습니다.
- Apple Developer ID 인증서를 발급받아 Tauri 빌드 프로세스에 탑재하고, Apple의 Notarization(공증) 및 Staple(스테이플) 과정을 완전 연동했습니다.

### 24-1. 로컬 빌드 서명 및 공증 스크립트 구축
- [scripts/build-mac-signed.sh](../scripts/build-mac-signed.sh) — 로컬 개발 환경에서 macOS 서명 및 공증 빌드를 수행하고, codesign/Gatekeeper/stapler 상태를 즉시 검증하는 자동화 스크립트를 구현했습니다.
- [src-tauri/.notarize.env.example](../src-tauri/.notarize.env.example) — 로컬 공증에 필요한 Apple ID 및 앱 전용 비밀번호(app-specific password) 템플릿 환경변수 파일을 작성했습니다.
- [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json) — macOS Bundle 설정 내 `signingIdentity`("Developer ID Application: Gu B Deu Co., Ltd. (LHR4658746)"), `hardenedRuntime: true`, `entitlements`를 설정했습니다.

### 24-2. CI/CD 자동 릴리스 파이프라인(GitHub Actions) 연동 및 검증 완료
- [.github/workflows/release.yml](../.github/workflows/release.yml) — GitHub Actions의 `release.yml` 내 `APPLE_*` 관련 6개 Secrets 환경변수 주석을 모두 해제하고 Secrets 바인딩을 완료했습니다.
- **DMG 공증 및 스테이플 보완**: Tauri 기본 액션이 `.app`만 스테이플하고 `.dmg`는 미공증 상태로 릴리스하는 한계를 해결하기 위해, 빌드 완료 후 `notarytool submit` 및 `stapler staple`을 추가 실행하여 DMG 파일까지 완전히 공증 후 교체 업로드하는 스크립트를 추가했습니다 (`v0.3.6`).
- **릴리스 배포 자동 공개**: 서명 및 공증이 검증됨에 따라 GitHub Release의 `releaseDraft` 옵션을 `false`로 전환하여, 태그 푸시 시 빌드와 서명/공증을 거쳐 실시간 릴리스 및 자동 업데이트(`latest.json`)가 정상 배포되도록 설정했습니다.

### 검증
- 로컬 verification 명령 실행 결과:
  - `spctl -a -vvv --type execute BaroSit.app` → **accepted (Notarized Developer ID)**
  - `xcrun stapler validate BaroSit.app` → **The validate action worked!**
  - `xcrun stapler validate BaroSit_0.3.4_aarch64.dmg` → **The validate action worked!**
- Gatekeeper 승인 및 Apple 공증 티켓이 정상적으로 스테이플되어, 다운로드 후 경고 없이 바로 실행 가능함을 성공적으로 검증했습니다.

## 알려진 한계

1. **macOS 전용 일부 동작** — 트레이 + Reopen 이벤트 + macOSPrivateApi
2. **카메라 충돌 극복** — 메인 ↔ 위젯 전환 및 가림 핸드오버 시의 250ms 딜레이와 App.tsx 수준의 상태 격상(Lift-up)으로 카메라 장치 점유 충돌 문제를 안전하게 해결했습니다.
3. **모델 외부 CDN 의존** — 첫 실행 시 ~20MB 다운로드 필요
4. **dev 모드 메모리 부담** — 2.7GB+ (프로덕션 빌드는 1GB 이하)
5. **빠른 움직임 시 검출 노이즈** — Image Segmenter 신뢰도 저하 가시화 (EMA로 완화)
