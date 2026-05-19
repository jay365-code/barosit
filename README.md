# BaroSit (바로씻)

데스크톱 웹캠으로 거북목, 턱 괴임, 어깨 기울임, 등 구부정한 자세를 실시간 감지하는 macOS/Windows 앱.

- 카메라 영상은 100% 온디바이스에서 처리되며 외부로 전송되지 않음
- 자세 감지: MediaPipe Pose Landmarker (33 랜드마크)
- 옵션 LLM 코칭: Anthropic Claude API (자세 텍스트 데이터만 전송)

## 개발 실행

```bash
npm install
npm run tauri dev
```

처음 실행 시 5초 캘리브레이션을 한 번 진행하면 모니터링이 시작됩니다.

## 빌드

```bash
npm run tauri build
```

빌드된 앱은 `src-tauri/target/release/bundle/`에서 확인할 수 있습니다.

## 구조

```
src/                        프론트엔드 (React + TS)
├── pose/                   포즈 감지·분석 로직
│   ├── detector.ts         MediaPipe Pose Landmarker
│   ├── analyzer.ts         자세 4종 판정 (베이스라인 대비)
│   ├── calibration.ts      캘리브레이션 기준 자세 측정
│   ├── smoothing.ts        이동평균·신뢰도 필터
│   ├── thresholds.ts       자세별 알림 임계값
│   ├── violationTracker.ts 지속시간 추적·쿨다운
│   └── eventLog.ts         자세 이벤트 이력
├── views/                  화면 (캘리브레이션·모니터·설정·대시보드)
├── ipc.ts                  Rust 백엔드 호출 래퍼
└── llmConfig.ts            Claude API 호출

src-tauri/                  Rust 백엔드
├── src/lib.rs              IPC 명령 등록
├── src/tray.rs             시스템 트레이 메뉴·상태
├── src/llm.rs              Anthropic Claude API 클라이언트 (prompt caching)
└── tauri.conf.json         윈도우·번들 설정
```
