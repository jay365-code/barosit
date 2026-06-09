# BaroSit QA Agent

바로씻 QA 체크리스트를 자동/반자동으로 검증하는 도구 모음. **상태는 대화가 아니라 이 폴더(파일)에 산다.**

## 구성
| 파일 | 역할 |
|---|---|
| `qa/checklist.json` | 단일 진실 소스 — 63항목(+verifyTier). `npm run qa:checklist` 로 TSX에서 재생성 |
| `qa/playbook.md` | 환경 사실·검증 절차·정리법 (에이전트가 매 실행 시 읽음) |
| `qa/runner.mjs` | **B. 독립 러너** — 모델 불필요 결정론적 검증(integration+unit). CI 게이트 |
| `qa/results/<ts>.json` | 실행 결과 (대시보드 Import 호환 `[{id,status,actualResult}]`) |
| `.claude/skills/barosit-qa/` | **검증 방법론 Skill** |
| `.claude/agents/barosit-qa-tester.md` | **A. 전용 서브에이전트** (독립 context) |

## 실행 범위(scope)
- `auto` : 사람 개입 불필요(≈50). 기본값.
- `full` : auto + 사람 개입 항목(13, 카메라/데스크톱/외부). 서브에이전트에서만 인터랙티브.

## 사용법
### A. 서브에이전트 (전체 검증, 권장)
Claude Code 세션에서:
```
@barosit-qa-tester 전체 자동검증 돌려줘            # scope=auto
@barosit-qa-tester scope=full 로 전부 검증해줘     # 사람개입 포함
@barosit-qa-tester Billing 카테고리만 검증         # 필터
```
→ 독립 context 에서 실행, 결과 JSON 생성, 요약만 반환. 메인 대화 안 더러워짐.

### B. 독립 러너 (CI/무인, 결정론적 코어)
```
npm run qa                       # scope=auto 전체 (integration+unit 실증)
node qa/runner.mjs --scope auto --only AUTH,COMM
```
→ Supabase 가동 필요. Fail 있으면 exit 1 (CI 게이트). runtime/code/manual 은 "서브에이전트 검증 권장"으로 표기.

### 결과 반영
생성된 `qa/results/<ts>.json` 을 QA 대시보드(`#/qa`) "📥 결과 불러오기" 로 Import.

## 체크리스트 갱신
`src/views/QaDashboardView.tsx` 수정 후:
```
npm run qa:checklist             # checklist.json 재생성
```
(verifyTier 매핑은 `qa/scripts/extract-checklist.mjs` 의 TIER 에서 관리)
