# 작업 이력 요약

세션 동안 진행된 주요 변경의 시간순 정리. 코드 아키텍처 진화와 결정의 맥락.

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

## 알려진 한계

1. **macOS 전용 일부 동작** — 트레이 + Reopen 이벤트 + macOSPrivateApi
2. **카메라 충돌** — 두 윈도우 동시 접근 시 race condition (250ms 지연 + 재시도로 완화)
3. **모델 외부 CDN 의존** — 첫 실행 시 ~20MB 다운로드 필요
4. **dev 모드 메모리 부담** — 2.7GB+ (프로덕션 빌드는 1GB 이하)
5. **빠른 움직임 시 검출 노이즈** — Image Segmenter 신뢰도 저하 가시화 (EMA로 완화)
