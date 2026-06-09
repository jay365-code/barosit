---
name: barosit-qa
description: Run the BaroSit QA checklist verification. Use when asked to test/verify BaroSit features, run the QA suite, self-check the app, or produce a QA results report. Verifies items from qa/checklist.json across code/Supabase/runtime/unit tiers and writes an importable results JSON. Supports scope=auto (no human) or scope=full (incl. human-in-the-loop).
---

# BaroSit QA 검증 Skill

BaroSit(자세 모니터링 Tauri+React+Supabase 앱)의 QA 체크리스트를 자가 검증한다.

## 시작 전 필수
1. `qa/playbook.md` 를 읽는다 (환경 사실·절차·포트·키 취득법·정리법). **이게 진실 소스다.**
2. `qa/checklist.json` 을 읽는다 (검증 대상 63항목 + verifyTier).
3. 인자에서 **scope** 를 파싱: `auto`(기본, manual 제외) | `full`(manual 포함, 사람 개입). 카테고리/ID 필터(`--only AUTH,BILL` 등)도 허용.

## 실행 절차
대상 = checklist 에서 scope/필터로 거른 항목. verifyTier 별로:

- **integration**: ⚠️ **반드시 `node qa/runner.mjs --scope auto`(또는 `--only <카테고리/ID>`)를 실행해서 검증하라. 손수 curl/python 스크립트를 짜지 말 것** — 복합 명령은 권한 승인 폭탄과 파싱 오류("Unhandled node type")를 유발한다. 러너가 테스트 유저 생성·실증·정리·결과파일(`qa/results/*.json`)까지 전부 처리하므로, 그 출력/결과파일을 근거로 통합 항목을 판정한다. (사전: `supabase status` 로 가동 확인, 미가동이면 `supabase start`.) 러너가 미커버하는 통합 항목이 있을 때만 보조적으로 직접 확인.
- **runtime**: `web-verify`(1431) 프리뷰 시작 → 라우트 진입/DOM 확인(playbook §4). 끝나면 프리뷰 stop.
- **unit**: `npx vitest run <해당 test>` 실행, 통과 여부.
- **code**: 소스 grep/read 로 상수·로직·와이어링 확인(file:line 근거).
- **manual** (scope=full 일 때만): playbook §5 프로토콜 — 준비 → 사람에게 **1줄 요청** → 응답 후 상태/DOM/프로세스로 판정. scope=auto 면 `Untested` + "[수동필요]" 로 남긴다.

## 판정·출력
- **항목에 `verifyNote` 가 있으면 그것이 최우선 합격 기준이다** (expected 의 모호함보다 우선 적용). 스펙을 과잉해석("FREE 전용이어야" 등)하지 말 것.
- 항목별 status(`Pass`/`Fail`/`N/A`/`Untested`) + actualResult(검증방식 태그 + 근거/실측).
- `qa/results/<YYYYMMDD-HHMM>.json` 에 `[{id,status,actualResult}]` 저장 (대시보드 Import 호환). 타임스탬프는 `date +%Y%m%d-%H%M`.
- 마지막에 요약: 집계(Pass/Fail/Untested) + Fail/주의 목록 + 각 Fail 의 원인(file:line)·수정안.

## 명령/권한 규칙 (승인 폭탄 방지)
- 통합 검증은 **무조건 `node qa/runner.mjs`** 로 (손수 curl/python 복합 명령 금지). 허용 목록에 등록돼 있어 추가 승인 없이 돈다.
- 단위는 `npx vitest run`, 체크리스트 재생성은 `node qa/scripts/extract-checklist.mjs`, 머지는 `node qa/scripts/merge-results.mjs` — 모두 허용됨.
- 변수할당+파이프+python 이 섞인 한 줄 스크립트는 권한 파서가 못 맞춰 매번 물어본다 → 피할 것.

## 함정 (이미 겪은 것)
- **함수 존재 ≠ 기능 제공**: UI 와이어링/라우트까지 확인할 것 (매직링크 교훈).
- 헤드리스 프리뷰엔 카메라·네이티브 창·OAuth 동의·실결제가 없다 → 해당은 manual.
- `UID` 셸 예약변수 회피. integration 후 테스트 데이터 정리 필수.
- DDL 은 `db reset`(데이터 소실) 말고 psql 직접 적용.

## 빠른 경로
- 결정론적 코어(integration+unit)만 무인으로: `node qa/runner.mjs --scope auto` (모델 불필요, CI 게이트).
- 전체(런타임 DOM·코드·사람개입 포함): 이 Skill 로 에이전트가 수행.
