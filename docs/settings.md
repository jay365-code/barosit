# 사용자 설정

설정 페이지 ([src/views/SettingsView.tsx](../src/views/SettingsView.tsx)) — 모든 설정은 localStorage에 저장.

## 자세별 임계값

각 자세 4종에 대해 두 값 조정:
- **알림 지속 시간** (초) — 위반이 N초 연속되어야 알람. 기본 5초.
- **민감도** (배율 0.5~2.0) — 임계 점수 multiplier. 1.0 기본.

저장 키: `thresholds` ([src/pose/thresholds.ts](../src/pose/thresholds.ts))

```ts
DEFAULT_THRESHOLDS = {
  forward_head: { durationSecs: 5, sensitivity: 1.0 },
  chin_resting: { durationSecs: 5, sensitivity: 1.0 },
  shoulder_tilt: { durationSecs: 5, sensitivity: 1.0 },
  slouching:    { durationSecs: 5, sensitivity: 1.0 },
}
```

"기본값으로 되돌리기" 버튼 제공.

## 위젯 모드 — 미니바 표시

체크박스: **"위젯에 미니바 표시"** (기본 ON)

저장 키: `minibar_visible` (`"0"` = 끄기, 그 외 = 켜기)

| 설정 | 효과 |
|---|---|
| ON (기본) | 미니바 보임. 위젯 모드 진입 가능. |
| OFF | 미니바 숨김. 위젯 모드 진입 버튼도 비활성. |

위젯 모드 중 미니바 OFF로 바꿔도 카메라 아이콘은 그대로 표시됨 (모드 우선).

## 프라이버시 — 실루엣 모드

체크박스: **"실루엣 모드"** (기본 ON)

저장 키: `privacy_mode` (`"0"` = OFF, 그 외 = ON)

| 설정 | 메인 화면 카메라 영역 |
|---|---|
| ON (기본) | 카메라 영상 숨김 + Image Segmenter 마스크로 색칠된 실루엣 + 얼굴 점들 |
| OFF | 실제 카메라 영상 + 랜드마크 오버레이 |

내부 사용 ([src/privacyConfig.ts](../src/privacyConfig.ts)) — `privacy-mode-change` CustomEvent로 변경 즉시 반영.

## LLM 코칭

체크박스: **"LLM 코칭 활성화"** (기본 OFF)

저장 키: `llm_coaching_enabled`, `anthropic_api_key`

API 키 입력 시 alarm 발생할 때 Anthropic Claude API를 호출해 맞춤형 코칭 메시지를 추가 알림으로 전송. 카메라 영상은 절대 전송되지 않고, **자세 종류·지속 시간·시간대·하루 누적 횟수** 같은 텍스트 메타데이터만 전송.

## 시작 옵션

체크박스: **"로그인 시 자동 시작"**

`@tauri-apps/plugin-autostart` 사용 — macOS LaunchAgent 등록.

## 앱 종료

설정 페이지 하단 빨간 버튼.

두 번 클릭 패턴:
- 1차: 텍스트 "다시 클릭하면 종료" + 색 진해짐 (3초 후 자동 취소)
- 2차: `quit_app` Tauri 명령 호출 → `app.exit(0)`

`window.confirm()` 이 macOS WKWebView에서 안 정확하게 동작해서 인라인 확인 패턴 사용.

## 베이스라인 (캘리브레이션)

설정 페이지엔 없지만 모니터 화면의 "다시 캘리브레이션" 버튼으로 재측정.

저장 키: `calibration_baseline` (전체 JSON)

베이스라인 삭제 후 메인 창 새로고침 → 캘리브레이션 화면 재진입.

## 위치 (위젯)

저장 키: `widget_position` — `{ x, y }` 픽셀 좌표 (PhysicalPosition)

사용자가 미니바를 드래그하면 자동 저장. 다음 실행 시 복원.
저장된 값 없으면 우측 상단(margin 20px + 메뉴바 30px).

## 디버그 모드 토글

모니터 화면의 "디버그 보기" 버튼.

저장 키: `monitor_debug_open` (`"1"` = 켜기)

켜면 모니터 화면 하단에 모든 분석 신호 실시간 표시.

## 점수

저장 키: `posture_score` — 현재 점수 (정수)

윈도우 간 동기화 — 한쪽이 갱신하면 storage 이벤트로 다른 쪽도 동기화.
사용자 직접 조작 UI 없음 (자동 누적/감산만).

## 자세 이벤트 로그 (대시보드용)

저장 키: `posture_events` — 알람 발사된 이력 JSON 배열.

대시보드 화면에서 일별 통계로 표시. 대시보드의 "기록 지우기" 버튼으로 리셋.

## 앱 모드

저장 키: `app_mode` — `"main"` | `"widget"`

자동 관리 (UI 액션으로 변경됨). 수동 변경 시 양쪽 윈도우 가시성 동기화 필요.

---

## 설정 요약 표

| 키 | 기본값 | 효과 |
|---|---|---|
| `thresholds` | 5초 / 1.0 (4종) | 자세별 알람 임계 |
| `minibar_visible` | ON | 미니바 표시 |
| `privacy_mode` | ON | 실루엣 모드 |
| `llm_coaching_enabled` | OFF | LLM 코칭 |
| `anthropic_api_key` | (empty) | Claude API 키 |
| `monitor_debug_open` | OFF | 디버그 패널 |
| `app_mode` | `main` | 현재 모드 |
| `posture_score` | 100 | 현재 점수 |
| `calibration_baseline` | (empty) | 베이스라인 |
| `widget_position` | (empty) | 위젯 좌표 |
| `widget_state` | (auto) | 위젯 broadcast |
| `posture_events` | (empty) | 이벤트 로그 |
