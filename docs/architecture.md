# 아키텍처

## 윈도우 구조

Tauri 2의 다중 윈도우. 한 앱 내 두 개의 독립 WebView.

| 윈도우 | label | 역할 | 기본 상태 |
|---|---|---|---|
| 메인 | `main` | 큰 창. 캘리브레이션·모니터·대시보드·설정 | 보임 |
| 플로팅 | `widget` | 작은 always-on-top 창. 미니바 + (옵션) 카메라 아이콘 | 보임 |

두 윈도우 모두 `index.html`을 로드하지만 URL hash 로 분기:
- 메인: `index.html` → `<App />` 렌더
- 플로팅: `index.html#widget` → `<Widget />` 렌더

분기 코드: [src/main.tsx](../src/main.tsx) — hash 검사 후 dynamic import.

## 앱 모드 (mutually exclusive)

`localStorage.app_mode` 가 진실 원천(single source of truth).

| 값 | 메인 창 | 카메라 아이콘 | 검출 owner |
|---|---|---|---|
| `"main"` (기본) | 보임 | 숨김 | 메인의 MonitorView |
| `"widget"` | 숨김 | 보임 | 플로팅의 `useMonitoringEngine` |

상태 동기화: 
- 로컬: `app-mode-change` CustomEvent
- 윈도우 간: `storage` 이벤트 (localStorage 갱신 자동 전파)

## 모드 전환

[src/ipc.ts](../src/ipc.ts) 에 헬퍼 함수.

```
switchToMainMode():
  saveAppMode("main")        # localStorage + 이벤트
  if !minibar setting: setWidgetVisible(false)  # 플로팅 윈도우 숨김
  await 250ms (카메라 인계 시간)
  showMainWindow()           # 메인 보이기

switchToWidgetMode():
  saveAppMode("widget")
  hideMainWindow()           # 메인 숨김
  await 250ms
  setWidgetVisible(true)     # 플로팅 보이기
```

`HANDOVER_DELAY_MS = 250` — 이전 owner의 `useEffect` cleanup이 카메라 해제할 시간 확보.

## 자동 모드 전환

- **메인 X 클릭** → Rust `CloseRequested` 이벤트 가로채기 → `main:close-requested` Tauri 이벤트 emit → JS가 듣고 `switchToWidgetMode()`
- **Dock 아이콘 클릭** → Rust `Reopen` 이벤트 → 메인 show + `main:reopened` emit → JS가 듣고 위젯 모드면 `switchToMainMode()`

이 두 경로로 사용자는 자연스럽게 모드를 오가게 됨.

## 검출 owner 모델

핵심 규칙: **한 시점에 하나의 owner만 카메라/감지 실행**. 두 윈도우 동시 카메라 접근 시 충돌 가능성 + CPU 중복.

| 모드 | 메인 MonitorView | 플로팅 Widget engine |
|---|---|---|
| `main` | 카메라 ON, 검출 ON, broadcast | 카메라 OFF, 검출 OFF |
| `widget` | 카메라 OFF | 카메라 ON, 검출 ON, broadcast |

- `useCamera(enabled)` 의 `enabled` 인자로 제어
- `usePoseLoop({enabled, ...})` 도 동일
- 비활성 쪽은 `scoreInputsRef.frozen = true` 로 점수 변동 중단

## Broadcast 채널

검출 owner가 다른 윈도우에 상태를 알리는 방식 — 2채널:

1. **localStorage `widget_state`** — JSON 문자열로 저장. `storage` 이벤트로 자동 전파.
2. **Tauri `widget:state` 이벤트** — `emit/listen` API.

두 채널 모두 사용 — localStorage는 persistence + 다른 윈도우 동기화, Tauri 이벤트는 즉시성.

`WidgetState` 타입 ([src/ipc.ts](../src/ipc.ts:14)):
```ts
interface WidgetState {
  status: PostureStatus;           // good/warning/bad/paused
  score: number;                   // 0-100
  away: boolean;                   // 자리비움 여부
  violations: PostureType[];       // 활성 위반 종류
  lastAlarm: { type, at } | null;
  maxDurationSecs: number;         // 최장 위반 지속
  stage: 0|1|2|3|4;                // 단계적 알림 강도
  pose: Landmarks | null;          // 미니 실루엣용 (throttle)
}
```

## 점수 동기화

`usePostureScore` 는 각 윈도우에서 독립 hook이지만 동기화됨:
- 자체 tick 시 `localStorage.posture_score` 에 쓰기
- 다른 윈도우의 storage 이벤트 수신 시 상태 업데이트
- `visibilitychange` / `focus` 이벤트로 윈도우 활성화 시 localStorage 재로드 (suspend 중 놓친 이벤트 보상)

## 시스템 트레이

[src-tauri/src/tray.rs](../src-tauri/src/tray.rs) — macOS 상단 메뉴바에 아이콘:
- 클릭: 메인 윈도우 표시
- 우클릭 메뉴: "창 열기" / "모니터링 일시정지" / "재개" / "종료"

상태색은 현재 tooltip만 — 아이콘 색 변경은 추가 작업 가능.

## 캘리브레이션 격리

캘리브레이션은 자체 카메라 핸들링을 가짐 ([CalibrationView.tsx](../src/views/CalibrationView.tsx)) — `useCamera()` 단독 호출. 메인/위젯의 owner 로직과 무관하게 캘리브레이션 시점에만 잠시 카메라 사용.

베이스라인은 localStorage `calibration_baseline` 에 저장. 두 윈도우 모두 storage 이벤트로 갱신 감지.
