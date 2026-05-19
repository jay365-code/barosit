# 개발 가이드

## 환경 요구사항

- macOS (Apple Silicon 또는 Intel) — 주 개발/테스트 플랫폼
- Node.js + npm
- Rust + cargo (Tauri 빌드용)
- 웹캠

## 첫 설정

```bash
npm install
```

Tauri 의존성은 `npm run tauri dev` 실행 시 자동 설치.

## 개발 실행

```bash
npm run tauri dev
```

- Vite 개발 서버 (HMR) + Rust 디버그 빌드
- 첫 실행 시 캘리브레이션 화면 → 5초 측정 → 모니터링 시작

## HMR 동작 범위

| 변경 | HMR 가능 | 재시작 필요 |
|---|---|---|
| `src/**/*.tsx`, `*.ts` (프론트) | ✓ | |
| `src/**/*.css` | ✓ | |
| `src-tauri/src/**/*.rs` | | Cargo 재빌드 |
| `src-tauri/tauri.conf.json` | | Cargo 재빌드 |
| `src-tauri/Cargo.toml` | | Cargo 재빌드 |
| `src-tauri/capabilities/*.json` | | Cargo 재빌드 |

Rust 변경 시 `Ctrl+C` 후 `npm run tauri dev` 다시 실행.

## 프로덕션 빌드

```bash
npm run tauri build
```

- `src-tauri/target/release/bundle/` 안에 `.app` (macOS), `.dmg` 등 생성
- 빌드 시간 1-3분
- 메모리 사용량이 dev 모드의 1/3 이하

## Windows 빌드

같은 Tauri 코드베이스로 Windows `.exe`/`.msi` 빌드. macOS 전용 경로는 cfg
분기로 격리돼 있어 별도 코드 분기 없이 빌드 타깃만 바꾸면 됨.

### 빌드 방법

옵션 A — **GitHub Actions (권장)**

[.github/workflows/build-windows.yml](../.github/workflows/build-windows.yml) 추가됨. git push tag `v*`
또는 Actions 탭에서 수동 실행하면 `windows-latest` 러너에서 빌드되어
`.msi` + `.exe` 산출물이 artifact로 첨부됨. macOS에서 직접 Windows MSVC
크로스 빌드는 `ring` 의존성이 Windows SDK 헤더를 요구해 환경상 불가.

옵션 B — **로컬 Windows 머신 / VM**

Windows 10/11에서:
```powershell
# 사전 설치: Node.js, Rust(stable), Microsoft C++ Build Tools (VS Build Tools)
npm install
npm run tauri build
# → src-tauri/target/release/bundle/msi/*.msi
# → src-tauri/target/release/bundle/nsis/*.exe
```

### macOS와의 동작 차이

| 항목 | macOS | Windows |
|---|---|---|
| 위젯 투명 | `macOSPrivateApi` + WKWebView | Edge WebView2 기본 알파 채널 (Windows 10 1809+) |
| Dock 클릭 → 메인 복귀 | `RunEvent::Reopen` | 트레이 아이콘 클릭으로 대체 (양 OS 공통 `main:reopened` emit) |
| 트레이 메뉴바 표시 | 이모지 title (🟢🟡🔴⚪) | tooltip 텍스트만 (Windows 트레이엔 title 개념 없음) |
| 알림 | Notification Center | Action Center (자동 처리) |
| 자동 시작 | LaunchAgent | 레지스트리 `Run` 키 (`tauri-plugin-autostart` 자동) |
| 종료 단축키 | Cmd+Q | Alt+F4 |

`macOSPrivateApi: true`는 Windows에서 자동 무시. `RunEvent::Reopen` 패턴
매치는 `#[cfg(target_os = "macos")]` 로 macOS 빌드에서만 활성.

## 웹 빌드

같은 프론트 코드베이스로 브라우저용 정적 SPA를 빌드. 백그라운드 모니터링,
시스템 트레이, 플로팅 위젯, LLM 코칭은 비활성. 모니터/캘리브/대시보드/설정은
그대로 동작.

```bash
npm run dev:web          # http://localhost:1430
npm run build:web        # dist-web/ 정적 번들
npm run preview:web      # 로컬 미리보기 (포트 1430)
```

Tauri dev 서버(1420)와 일반적인 Vite 기본(5173/5174)을 피해 1430을 사용.

플랫폼 분기는 `import.meta.env.VITE_PLATFORM` 으로 빌드 타임 결정.
구현은 [src/platform/](../src/platform/) — `tauri.ts` 와 `web.ts` 가 동일
`PlatformAPI` 인터페이스를 만족. Vite의 `define` 으로 상수 치환되어 사용되지
않는 쪽은 트리쉐이킹됨.

배포는 `dist-web/` 를 정적 호스팅(Cloudflare Pages, Vercel, Netlify 등)에
업로드. HTTPS 필수 — 카메라/알림 권한은 HTTPS 컨텍스트에서만 부여됨.
MediaPipe 모델은 Google CDN(`storage.googleapis.com`) 에서 자동 로드.

빌드된 앱 실행:
```bash
open src-tauri/target/release/bundle/macos/BaroSit.app
```

## 디버깅

### 프론트엔드 DevTools
Tauri 윈도우 우클릭 → Inspect (dev 빌드만). 콘솔, 네트워크, localStorage 모두 표준 DevTools.

### Rust 로그
Rust 코드에 `println!` 추가하면 dev 서버 터미널에 출력. release 빌드에선 안 보임.

### 디버그 패널
모니터 화면의 "디버그 보기" 버튼 — 모든 분석 신호 실시간 표시:
- `person/face/hands` 감지 여부
- 각 랜드마크 visibility
- 거북목 4신호 분해 (`size`/`z`/`drop`/`pitch`)
- 턱괴임 5조건
- 어깨/슬라우치 점수
- 현재 스트레칭 종류

### localStorage 직접 조작
DevTools 콘솔에서:
```js
localStorage.removeItem("calibration_baseline")  // 캘리브 다시
localStorage.clear()                              // 전체 리셋
localStorage.setItem("widget_enabled", "1")       // (구) 위젯 강제 ON
```

## 성능 측정

```bash
# CPU/메모리
ps -axo pid,pcpu,rss,comm,args | grep -E "barosit|BaroSit|WebKit\.GPU|WebKit\.WebContent"
```

주요 프로세스:
- `target/debug/barosit` — Rust 백엔드
- `com.apple.WebKit.WebContent` — 메인/위젯 WebView (XPC 서비스)
- `com.apple.WebKit.GPU` — GPU 처리

dev vs release 비교:
| | dev | release |
|---|---|---|
| CPU | ~40% | ~25-30% |
| RSS | ~2.7 GB | ~600 MB ~ 1 GB |
| 빌드 | 3-5초 | 1-3분 |

## 자주 마주치는 문제

### 카메라 권한
첫 실행 시 macOS 시스템 환경설정 → 개인 정보 보호 → 카메라 → 앱 허용. dev 모드는 "Terminal" 또는 "Visual Studio Code" 등이 호출 주체로 잡힘.

### 미니바 안 보임
- 설정에서 "미니바 표시" 켜져 있는지 확인
- 위젯 윈도우가 화면 밖에 있을 수 있음 — `localStorage.removeItem("widget_position")` 후 새로고침

### 모드 전환 후 카메라 안 잡힘
이전 owner가 카메라 release 못한 경우. 250ms 핸드오버 지연 + 800ms 재시도 로직이 있지만 그래도 실패하면 위젯 새로고침 (Cmd+R).

### 점수가 100 고정
- 베이스라인 확인 (`localStorage.getItem("calibration_baseline")`)
- 카메라 작동 확인
- 디버그 패널에서 `person: YES` 확인
- 위반 detect 시 2초 이상 지속 후에야 점수 떨어짐 (그레이스)

### Dev 서버 재시작 후 capability 권한 안 잡힘
`src-tauri/capabilities/*.json` 변경은 Rust 빌드 시점에 컴파일됨. `Cargo.toml`도 한 번 더 변경한 척 저장하거나 `cargo clean` 후 재빌드.

## 폴더 구조

```
barosit/
├── docs/                       이 문서들
├── index.html                  단일 entry HTML
├── src/                        프론트엔드
│   ├── main.tsx                hash 기반 main vs widget 라우팅
│   ├── App.tsx                 메인 앱 (탭 전환 + status pill)
│   ├── ipc.ts                  Rust 명령 + 이벤트 헬퍼
│   ├── llmConfig.ts            LLM 코칭
│   ├── privacyConfig.ts        실루엣 모드 설정
│   ├── styles.css              메인 앱 CSS
│   ├── components/
│   │   ├── LandmarkOverlay.tsx 영상 위 랜드마크
│   │   └── SilhouetteOverlay.tsx 마스크 기반 실루엣
│   ├── hooks/
│   │   ├── useCamera.ts        getUserMedia + 재시도
│   │   ├── usePoseLoop.ts      setTimeout-recursive 검출 루프
│   │   ├── usePostureScore.ts  점수 hook
│   │   └── useMonitoringEngine.ts 검출 파이프라인 통합
│   ├── pose/
│   │   ├── types.ts            Landmark, PostureStatus 등
│   │   ├── detector.ts         4개 MediaPipe 모델
│   │   ├── analyzer.ts         자세 4종 판정
│   │   ├── calibration.ts      베이스라인 측정 + 적합성 체크
│   │   ├── smoothing.ts        LandmarkSmoother (이동평균)
│   │   ├── violationSmoother.ts EMA + 히스테리시스
│   │   ├── violationTracker.ts 알람 트래킹
│   │   ├── stretchDetector.ts  스트레칭 4종
│   │   ├── thresholds.ts       임계값 설정
│   │   └── eventLog.ts         자세 이벤트 이력
│   └── views/
│       ├── MonitorView.tsx     메인 모니터링
│       ├── CalibrationView.tsx 캘리브레이션
│       ├── DashboardView.tsx   대시보드 (통계)
│       ├── SettingsView.tsx    설정
│       └── Widget.tsx          위젯 (플로팅)
├── src-tauri/                  Rust 백엔드
│   ├── src/
│   │   ├── lib.rs              명령·이벤트 등록
│   │   ├── tray.rs             시스템 트레이
│   │   └── llm.rs              Anthropic API 클라이언트
│   ├── Cargo.toml              Rust 의존성
│   ├── tauri.conf.json         윈도우·번들 설정
│   └── capabilities/default.json 권한
├── package.json
└── tsconfig.json
```

## 외부 모델 URL

MediaPipe 모델은 CDN에서 직접 로드 (앱 번들에 미포함):

| 모델 | URL |
|---|---|
| Pose | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` |
| Face | `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` |
| Hand | `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` |
| Segmenter | `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite` |

WASM 런타임: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm`

처음 실행 시 모델 다운로드(약 20MB) — Tauri WebKit이 자체 캐시함 (`~/Library/Caches/barosit/WebKit/NetworkCache/`).

오프라인 사용을 원하면 모델을 앱 번들에 포함해야 함 — 현재는 미구현.
