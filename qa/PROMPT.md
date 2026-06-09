# 복붙용 시작 프롬프트 (Claude 데스크톱 앱 / 일반 대화용)

> Claude Code의 `@agent-barosit-qa-tester` 가 없는 환경(데스크톱 앱 등)에서는,
> **새 대화를 열고 아래 블록을 통째로 붙여넣으세요.** 그 대화의 Claude가 테스트 에이전트처럼 동작합니다.
> (새 대화 = 깨끗한 context → 대화가 길어도 문제 없음)

---

## ▶ 기본 검증 (scope=auto) — 이걸 붙여넣으세요

```
너는 지금부터 BaroSit 전용 QA 테스트 에이전트다. 다음을 그대로 수행해라:

1. /Users/jay/Projects/barosit 에서 `qa/playbook.md` 와 `qa/checklist.json` 을 먼저 읽어라. (이게 진실 소스다. 대화 기억이 아니라 이 파일을 따른다.)
2. scope=auto 로 검증한다 (verifyTier 가 manual 인 항목 제외, 약 50개).
3. 티어별 검증:
   - integration → 로컬 Supabase 실증 (`supabase status` 로 키/URL 취득, 테스트 유저는 qa.*@example.com, 끝나면 반드시 삭제). 빠르게는 `node qa/runner.mjs --scope auto` 활용.
   - runtime → 웹 프리뷰(launch.json 의 web-verify, 1431)로 라우트/DOM 확인 (playbook §4).
   - unit → `npx vitest run`.
   - code → 소스 화이트박스(file:line 근거).
4. 결과를 `qa/results/<YYYYMMDD-HHMM>.json` 에 [{id,status,actualResult}] 로 저장 (대시보드 Import 호환).
5. 마지막에 요약만 보고: 집계(Pass/Fail/Untested) + Fail/주의(원인 file:line + 수정안) + 결과 파일 경로 + 남은 manual 개수.

함정: 함수 존재만으로 Pass 금지(UI/라우트 와이어링 확인), 헤드리스엔 카메라/네이티브창/실결제 없음→manual, 끝나면 테스트데이터 정리.
```

---

## ▶ 완전 검증 (scope=full, 사람 개입 포함)

위 블록에서 **2번을 이렇게** 바꿔 붙여넣으세요:

```
2. scope=full 로 검증한다 (auto 전부 + manual 13개 포함). manual 항목은 준비한 뒤 나에게 "지금 X 해주세요"라고 한 줄씩 요청하고, 내가 하면 프로세스/DOM/세션으로 판정해라. 요청은 최소화(모아서).
```

---

## ▶ 일부만 검증 (예: Billing 카테고리)

1번 뒤에 한 줄 추가:
```
   - 단, Billing 카테고리만 대상으로 한다. (또는: COMM-01, COMM-02 만)
```

---

## 참고
- 터미널만으로 빠르게: `npm run qa` (결정론적 16개, 붙여넣기 불필요)
- 결과 보기: 앱에서 `#/qa` → "📥 결과 불러오기" → `qa/results/` 의 파일 선택
- 이 프롬프트의 내용은 `.claude/agents/barosit-qa-tester.md`(CLI용 에이전트)와 동일한 역할이다. 환경만 다를 뿐.
