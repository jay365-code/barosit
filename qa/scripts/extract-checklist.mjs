#!/usr/bin/env node
// QaDashboardView.tsx 의 INITIAL_TEST_CASES 를 단일 진실 소스 qa/checklist.json 으로 추출.
// TSX 에 박힌 데이터를 손으로 옮기지 않고 자동 동기화한다. (TSX 변경 시 재실행)
//   node qa/scripts/extract-checklist.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const TSX = resolve(ROOT, "src/views/QaDashboardView.tsx");
const OUT = resolve(ROOT, "qa/checklist.json");

// 검증 티어 매핑 — 이번 자가검증 세션에서 확정한 항목별 검증 방법.
//   manual: 사람/하드웨어/외부 필요 (scope=auto 에서 제외)
//   integration: 로컬 Supabase 연동, runtime: 프리뷰 DOM, unit: vitest, code: 화이트박스
const TIER = {
  "AUTH-01": "integration", "AUTH-02": "integration", "AUTH-04": "runtime",
  "AUTH-05": "integration", "AUTH-06": "integration", "AUTH-07": "runtime",
  "BILL-04": "manual", "BILL-05": "runtime", "BILL-06": "integration",
  "BILL-07": "runtime", "BILL-08": "integration",
  "MONI-01": "manual", "MONI-02": "unit", "MONI-03": "code", "MONI-04": "runtime",
  "MONI-05": "code", "MONI-06": "code", "MONI-07": "runtime", "MONI-08": "runtime", "MONI-09": "manual",
  "SET-01": "runtime", "SET-02": "runtime", "SET-03": "runtime", "SET-04": "runtime", "SET-05": "runtime",
  "SET-06": "runtime", "SET-07": "runtime", "SET-08": "runtime", "SET-09": "runtime", "SET-10": "runtime",
  "SYNC-01": "runtime", "SYNC-02": "code", "SYNC-03": "code", "SYNC-04": "code",
  "COMM-01": "integration", "COMM-02": "integration", "COMM-03": "integration", "COMM-04": "integration",
  "WEB-01": "runtime", "WEB-02": "runtime", "WEB-03": "runtime",
  "ADMN-01": "runtime", "ADMN-02": "runtime", "ADMN-03": "integration", "ADMN-04": "integration",
  "ADMN-05": "integration", "ADMN-06": "code", "ADMN-07": "code", "ADMN-08": "integration", "ADMN-09": "integration", "ADMN-14": "runtime",
  "LIFE-01": "runtime", "LIFE-02": "runtime", "LIFE-03": "manual",
  "DESK-01": "manual", "DESK-02": "manual", "DESK-03": "manual", "DESK-04": "manual",
  "DESK-05": "manual", "DESK-06": "manual", "DESK-07": "manual", "DESK-08": "manual", "DESK-09": "manual",
};

// 판정 기준 노트(verifyNote) — 자가검증 중 확인된 "정확한 합격 기준/함정".
// 항목 expected 만으론 오해 소지가 있는 것들에 명시. (오탐 방지)
const NOTES = {
  "AUTH-01": "authorize?provider=google → HTTP302 + accounts.google.com 리다이렉트면 Pass. 외부 동의 화면 클릭만 사람 몫(integration 으로 충분).",
  "AUTH-02": "authorize?provider=kakao → HTTP302 + kauth.kakao.com 이면 Pass. 로컬은 실 카카오 키로 구성됨(placeholder 아님). 프로덕션 키만 별도 확인 대상.",
  "BILL-07": "코드상 상태값은 'grace_period' (payment_failed 아님). status==='grace_period' && grace_period_until 미래값일 때 배너(App.tsx:584).",
  "BILL-08": "직접 DB 수정이 아니라 payment-cancel Edge Function invoke 경유가 정상(ProfileView.tsx:262). admin_notifications 직접 인서트를 기대하지 말 것.",
  "MONI-03": "판정기준: 'FREE가 백그라운드(탭 숨김)에서 멈추는가'만 확인. 웹은 플랜 무관 정지가 정상(PRO도 멈춰도 무방) — MonitorView.tsx:576 cameraActive=false. 'FREE 전용 정지여야 한다'로 읽지 말 것. PRO 백그라운드 지속은 데스크톱 위젯(Widget+useMonitoringEngine, visible:true) 기능이며 웹 항목 아님.",
  "MONI-04": "현 런칭 정책상 코칭은 임시 개방(MonitorView.tsx:3171 `{true ? ...}`) → FREE도 접근 가능한 것이 정상=Pass. PRO 잠금 재활성 시 기대값 환원.",
  "MONI-06": "5분 타이머(setInterval 300000). FREE는 syncService.ts:35-38 에서 전송 차단되고 PRO만 실제 업로드 → 정상.",
  "COMM-02": "조회수/좋아요는 increment_post_views/increment_post_likes RPC(SECURITY DEFINER, 마이그레이션 20260521000011)로 +1 되면 Pass. posts 직접 UPDATE 는 소유자 전용 RLS 라 타인 글에서 차단되는 게 정상(회귀 확인).",
};

const src = readFileSync(TSX, "utf-8");
const start = src.indexOf("INITIAL_TEST_CASES");
// `... TestCase[] = [` 의 실제 배열 시작([)을 잡는다 ("= [" 패턴 이후)
const arrStart = src.indexOf("[", src.indexOf("= [", start));
// 배열 끝: 줄머리의 `];` (문자열 안의 대괄호와 무관하게 안전)
const end = src.indexOf("\n];", arrStart) + 2;
const literal = src.slice(arrStart, end);
// 순수 데이터 리터럴이므로 eval 로 안전 변환 (외부 참조 없음)
const cases = eval("(" + literal + ")");

const checklist = cases.map((c) => ({
  id: c.id,
  category: c.category,
  title: c.title,
  method: c.method,
  expected: c.expected,
  platforms: c.platforms,
  verifyTier: TIER[c.id] || "code",
  ...(NOTES[c.id] ? { verifyNote: NOTES[c.id] } : {}),
}));

const missing = checklist.filter((c) => !TIER[c.id]);
if (missing.length) console.warn("⚠️ TIER 미지정(code 기본):", missing.map((m) => m.id).join(", "));

writeFileSync(OUT, JSON.stringify(checklist, null, 2) + "\n");
const byTier = checklist.reduce((a, c) => ((a[c.verifyTier] = (a[c.verifyTier] || 0) + 1), a), {});
console.log(`✅ ${checklist.length}개 → ${OUT}`);
console.log("티어별:", byTier);
console.log("scope=auto 대상:", checklist.filter((c) => c.verifyTier !== "manual").length, "/ manual:", checklist.filter((c) => c.verifyTier === "manual").length);
