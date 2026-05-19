# BaroSit — 문서

데스크톱 웹캠으로 자세를 모니터링하고 잘못된 자세에 알람을 주는 macOS/Windows 앱.

## 핵심 컨셉

- **2가지 모드**로 동작: **메인 모드**(큰 창) ↔ **위젯 모드**(작은 카메라 아이콘)
- **미니바**: 항상 떠 있는 작은 상태 표시 (설정으로 끌 수 있음)
- 모든 자세 감지는 **온디바이스**에서 처리 — 카메라 영상이 외부로 나가지 않음
- 선택적 LLM 코칭(Anthropic Claude API) — 자세 텍스트 데이터만 전송

## 문서 구조

| 문서 | 내용 |
|---|---|
| **[project-status.md](./project-status.md)** | **현황 + 향후 작업 — 새 대화창에서 작업 이어가려면 먼저 읽기** |
| [기획안.md](./기획안.md) | 앱 전체 기획서 — 현재 구현 기준 + 플랫폼 확장 전략 |
| [architecture.md](./architecture.md) | 윈도우·모드·검출 owner 구조 |
| [detection-algorithm.md](./detection-algorithm.md) | 자세 감지 + 안정화 + 점수 알고리즘 |
| [ui-modes.md](./ui-modes.md) | 메인/위젯 모드 UX 흐름과 전환 |
| [settings.md](./settings.md) | 사용자 설정과 각 설정의 효과 |
| [ipc-reference.md](./ipc-reference.md) | Tauri 명령·이벤트 레퍼런스 |
| [development.md](./development.md) | 개발/빌드 가이드 |
| [changelog.md](./changelog.md) | 작업 이력 요약 (세션 변경 기록) |

> 📌 **진실의 원천**: 실제 코드. 모든 문서(기획안 포함)는 코드 현재 상태를 반영해 작성·유지됨.

## 주요 기능 요약

### 자세 감지 (4종)
- **거북목** — 머리가 어깨 앞으로 나옴
- **턱 괴임** — 손을 얼굴/턱에 받침
- **어깨 기울임** — 어깨가 한쪽으로 기울어짐
- **등 구부정** — 어깨가 앞으로 말리고 등이 굽음

### 스트레칭 보너스 (4종)
- **기지개** (+5점) — 양 팔 위로
- **목 풀기** (+5점) — 양손 머리 뒤
- **어깨 스트레치** (+4점) — 한 팔이 반대편으로
- **사이드 굽힘** (+3점) — 한 팔 위 + 어깨 기울임

### 모니터링 모드
- **메인 모드**: 큰 창에서 실루엣·점수·통계 모두 확인
- **위젯 모드**: 작은 카메라 아이콘만 떠 있고 백그라운드 모니터링 계속

### 점수 시스템 (0–100)
- 좋은 자세 유지 시 회복 가속 (1→2→3/초)
- 위반 지속 시 패널티 가속 (0.5→1→2→3/초)
- 스트레칭으로 보너스 점수

## 기술 스택

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust + Tauri 2
- **자세 감지**: MediaPipe Tasks Vision (Pose + Face + Hand + Image Segmenter)
- **선택 API**: Anthropic Claude (코칭 메시지 옵션)

## 폴더 구조

```
src/                        프론트엔드
├── pose/                   감지·분석 로직
│   ├── detector.ts         4개 모델 (Pose/Face/Hand/Segmenter)
│   ├── analyzer.ts         자세 4종 판정
│   ├── calibration.ts      베이스라인 측정
│   ├── violationSmoother.ts EMA + 히스테리시스
│   ├── stretchDetector.ts  스트레칭 감지
│   └── ...
├── hooks/
│   ├── useMonitoringEngine.ts  검출 파이프라인 전체
│   ├── usePostureScore.ts      점수 hook
│   └── ...
├── views/
│   ├── MonitorView.tsx     메인 모니터링 화면
│   ├── CalibrationView.tsx 캘리브레이션
│   ├── Widget.tsx          위젯 윈도우 (미니바 + 카메라 아이콘)
│   └── ...
└── ipc.ts                  Rust 백엔드 호출 래퍼

src-tauri/                  Rust 백엔드
├── src/lib.rs              명령·이벤트 등록
├── src/tray.rs             시스템 트레이
└── tauri.conf.json         윈도우 설정
```
