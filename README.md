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

## QA 테스트 (자가검증 에이전트)

체크리스트 63항목을 자동/반자동으로 검증하는 도구가 `qa/` 에 있습니다. 검증 상태는 대화가 아니라 **파일**(체크리스트·플레이북·결과)에 저장되어 반복 실행에 안정적입니다.

| 용도 | 명령 / 호출 | 범위 |
|---|---|---|
| 빠른 회귀 (무인·결정론적) | `npm run qa` | integration+unit 16개 |
| 전체 자가검증 (AI 에이전트) | Claude Code: `@agent-barosit-qa-tester` · 데스크톱 앱: `qa/PROMPT.md` 붙여넣기 | ~50개 (scope=auto) |
| 사람 개입 포함 전체 | 위 호출 + `scope=full` | 63개 (카메라·데스크톱·결제 포함) |
| 두 결과 합치기 | `npm run qa:merge` | 강한 증거 우선 머지 |
| 체크리스트 재생성 | `npm run qa:checklist` | TSX → `qa/checklist.json` |

- 사전 준비: 통합 검증은 `supabase start`, 화면 검증은 웹 프리뷰가 필요(에이전트가 자동 기동).
- 결과 `qa/results/<시간>.json` → 앱 `#/qa` 대시보드 "📥 결과 불러오기"로 Import.
- 상세 문서: `qa/README.md` · 초보자용 `qa/사용설명서.md`

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

qa/                         QA 자가검증 에이전트
├── checklist.json          체크리스트 63항목 (단일 진실 소스, verifyNote 포함)
├── playbook.md             검증 절차·환경 사실·판정 기준
├── runner.mjs              독립 러너 (npm run qa, 무인 결정론적)
├── scripts/                추출(extract)·머지(merge) 스크립트
├── results/                실행 결과 (대시보드 Import 호환, git 제외)
├── PROMPT.md               데스크톱 앱용 복붙 시작 프롬프트
└── 사용설명서.md            초보자용 쉬운 설명
```
