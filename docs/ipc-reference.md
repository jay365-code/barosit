# IPC 레퍼런스

Rust 백엔드 ↔ JS 프론트엔드, 그리고 윈도우 간 통신.

## Tauri 명령 (JS → Rust)

`invoke("name", args)` 로 호출. 정의: [src-tauri/src/lib.rs](../src-tauri/src/lib.rs)

### 자세 알림
```ts
show_posture_alert({
  posture_type: string,       // "forward_head" | "chin_resting" | ...
  duration_secs: number,
  severity: "warning" | "bad",
  coaching_message: string | null,
})
```
OS 푸시 알림 발사.

### 상태 동기화 (트레이)
```ts
update_status(status: "good" | "warning" | "bad" | "paused")
```
트레이 tooltip 갱신.

### 윈도우 제어
```ts
show_main_window()        // 메인 윈도우 표시 + 포커스
hide_main_window()        // 메인 윈도우 숨김
set_widget_visible(visible: boolean)  // 플로팅 윈도우 토글
quit_app()                // 앱 완전 종료
```

### LLM 코칭
```ts
generate_coaching_message({
  api_key: string,
  posture_type: string,
  duration_secs: number,
  today_count_for_type: number,
  hour: number,
}): Promise<string>
```
Anthropic Claude API 호출해 한국어 코칭 메시지 생성.

## Tauri 이벤트 (Rust → JS)

`listen("name", cb)` 로 구독.

### 모니터링 제어
- `monitoring:pause` — 트레이 메뉴 "일시정지" 선택 시
- `monitoring:resume` — 트레이 메뉴 "재개" 선택 시

### 윈도우 라이프사이클
- `main:close-requested` — 메인 X 버튼 클릭 (Rust가 hide도 함께 처리, JS는 모드 전환)
- `main:reopened` — Dock 아이콘 클릭 등 reopen 이벤트

### 위젯 상태
- `widget:state` — `WidgetState` 페이로드. broadcast 채널.

## 윈도우 간 통신

### localStorage + storage 이벤트
모든 Tauri 윈도우가 같은 origin이라 localStorage 공유. setItem 시 다른 윈도우에 `storage` 이벤트 전파 (같은 윈도우엔 안 옴).

주요 키와 의미:
| 키 | 쓰는 곳 | 읽는 곳 |
|---|---|---|
| `app_mode` | 모드 전환 함수 | 양쪽 윈도우 |
| `widget_state` | 검출 owner | 다른 윈도우 (display) |
| `posture_score` | usePostureScore | 같은 hook 다른 인스턴스 |
| `calibration_baseline` | CalibrationView | useMonitoringEngine, MonitorView |
| `widget_position` | 위젯 윈도우 (사용자 드래그) | 위젯 자신 (다음 실행) |
| `thresholds` | 설정 | 분석 + 트래커 |

### 즉시 알림 (CustomEvent)
같은 윈도우 내 컴포넌트 간 즉시 통신.

- `app-mode-change` — `saveAppMode` 호출 시 발사. detail: `"main"|"widget"`
- `privacy-mode-change` — `setPrivacyMode` 호출 시
- `posture-bonus` — 스트레칭 보너스 발사 시. detail: 점수(number)
- `widget-state` — `publishWidgetState` 의 Tauri emit과 별도로 동작

## 헬퍼 함수 ([src/ipc.ts](../src/ipc.ts))

### 모드 전환
```ts
switchToMainMode(): Promise<void>
switchToWidgetMode(): Promise<void>
```
각각 `saveAppMode` + 윈도우 가시성 토글 + 250ms 카메라 핸드오버 지연.

### 상태 broadcast
```ts
publishWidgetState(state: WidgetState): Promise<void>
onWidgetState(cb): Promise<UnlistenFn>
```

### 모드 확인
```ts
loadAppMode(): "main" | "widget"
saveAppMode(mode): void
```

### 미니바 설정
```ts
isMinibarVisible(): boolean
setMinibarVisible(visible: boolean): void
```

### 이벤트 리스너
```ts
onPauseEvent(cb), onResumeEvent(cb)
onMainCloseRequested(cb), onMainReopened(cb)
```

## 권한 (capabilities)

[src-tauri/capabilities/default.json](../src-tauri/capabilities/default.json) — main과 widget 윈도우 모두에 적용.

핵심 권한:
- `core:default`, `core:webview:default`, `core:tray:default`, `core:menu:default`, `core:image:default`
- `core:window:default`
- `core:window:allow-start-dragging` — 위젯 드래그
- `core:window:allow-set-position` — 위젯 위치 저장/복원
- `core:window:allow-outer-size`, `core:window:allow-current-monitor` — 우측 상단 자동 배치
- `notification:default`, `store:default`, `autostart:default`

## Tauri 설정 ([tauri.conf.json](../src-tauri/tauri.conf.json))

`macOSPrivateApi: true` — WebView 투명 배경 활성 (위젯 윈도우용)

윈도우 정의:
- `main`: 960×720, resizable, minimize 활성, decorations true
- `widget`: 200×180, frameless, transparent, alwaysOnTop, skipTaskbar, shadow false, 시작 시 hidden
