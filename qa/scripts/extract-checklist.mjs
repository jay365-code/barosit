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
  "AUTH-08": "integration", "AUTH-09": "runtime", "AUTH-10": "code",
  "BILL-04": "manual", "BILL-05": "runtime", "BILL-06": "integration",
  "BILL-07": "runtime", "BILL-08": "integration",
  "MONI-01": "manual", "MONI-02": "unit", "MONI-03": "code", "MONI-04": "runtime",
  "MONI-05": "code", "MONI-06": "code", "MONI-07": "runtime", "MONI-08": "runtime", "MONI-09": "manual",
  "MONI-10": "unit", "MONI-11": "unit", "MONI-12": "unit", "MONI-13": "code", "MONI-14": "unit",
  "SET-01": "runtime", "SET-02": "runtime", "SET-03": "runtime", "SET-04": "runtime", "SET-05": "runtime",
  "SET-06": "runtime", "SET-07": "runtime", "SET-08": "runtime", "SET-09": "runtime", "SET-10": "runtime",
  "SET-11": "code", "SET-12": "code",
  "SYNC-01": "runtime", "SYNC-02": "code", "SYNC-03": "code", "SYNC-04": "code", "SYNC-05": "code",
  "COMM-01": "integration", "COMM-02": "integration", "COMM-03": "integration", "COMM-04": "integration",
  "COMM-05": "integration", "COMM-06": "integration", "COMM-07": "integration",
  "WEB-01": "runtime", "WEB-02": "runtime", "WEB-03": "runtime", "WEB-04": "code", "WEB-05": "code",
  "WEB-06": "code", "WEB-07": "code", "WEB-08": "code",
  "ADMN-01": "runtime", "ADMN-02": "runtime", "ADMN-03": "integration", "ADMN-04": "integration",
  "ADMN-05": "integration", "ADMN-06": "code", "ADMN-07": "code", "ADMN-08": "integration", "ADMN-09": "integration", "ADMN-14": "runtime",
  "LIFE-01": "runtime", "LIFE-02": "runtime", "LIFE-03": "manual", "LIFE-04": "code",
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
  "AUTH-08": "authorize?provider=apple → HTTP302 + appleid.apple.com 이면 Pass(실증). 로컬은 Apple 시크릿(.p8 JWT)이 gitignore 라 provider 미구성 → 400 이 정상 — 이 경우 AUTH-02 처럼 클라 배선(signInWithApple: useAuth.ts:452·Marketing.tsx·ProfileView.tsx:639) 검증 + 프로덕션 302 E2E(changelog §0-8) 로 Pass, 프로덕션 키만 별도 확인 대상. supabase/.env 에 APPLE 키 주입 시 로컬 실증 가능. ⚠️ client secret 6개월 만료 회전 필요.",
  "AUTH-09": "런타임 판정: #/forgot-password·#/reset-password 라우트 렌더 + 로그인 페이지 회원가입 폼 존재면 Pass. useAuth: signUpWithPassword(490)·resetPasswordForEmail(523, redirectTo /#/reset-password)·updatePassword(534). 실 메일 도착(RESEND SMTP)은 프로덕션 확인 대상(로컬은 확인메일 미발송 가능).",
  "AUTH-10": "코드: migration 20260630000000_account_deletion.sql(profiles.deletion_requested_at/deletion_scheduled_at +30d, purge_deleted_accounts()) + 20260630000001_account_purge_cron.sql(pg_cron) + functions/delete-account/index.ts(soft, 자동갱신 해지) 존재. billing_history 5년 익명보존. 즉시 물리삭제가 아니면 Pass — 실제 파기는 유예 경과분만.",
  "MONI-10": "단위: `npx vitest run src/pose/breakTracker.test.ts`. movementGoalSecs=60(breakTracker.ts:34) dose-gate — 누적 움직임 60초 채워야 리셋, 순간 스트레치 1회로는 리셋 안 됨. 6개 케이스 전부 통과면 Pass.",
  "SET-11": "코드: alertConfig.ts forceMode 기본 false(:37) 옵트인. IPC emit/onForceBlur(AlertWindow.tsx:14) 배선 + 30초 자동해제·5분 쿨다운·35초 실패안전·click-through 상수 확인. 데스크톱=AlertWindow(비잠금)/웹=AlertOverlay.",
  "SET-12": "코드: Widget.tsx 착석 1분+ 경과 상시표시 + 30분 근접 톤 상승(회→황→주황) + breakBadge 상호배타 렌더 로직 확인. 데스크톱 위젯 전용(웹 미해당).",
  "SYNC-05": "코드: useEntitlement.ts — 검증 이력 있는 Pro 는 오프라인/조회실패 시 마지막 plan 유지(강등 없음, :92-99), 이력 전무면 Free(변조 방어), 온라인 복구 시 verify() 서버값 정정. 기존 14일 캡 제거됨. Pro 전용 게이팅 자체는 유지.",
  "COMM-05": "통합: toggle_post_like/toggle_comment_like SECURITY DEFINER RPC(migration 20260630090000_per_user_likes.sql) → post_likes/comment_likes 1인1행 insert, 재호출 시 삭제(decrement, 20260630080000) + posts.likes/comments.likes 증감. 게스트 localStorage 는 별도(하이브리드).",
  "COMM-06": "통합: 비어드민 JWT 로 category='블로그'(또는 공지) posts INSERT → enforce_notice_admin_only 트리거(migration 20260701000000_blog_category_admin_only.sql) 로 거부(BEFORE INSERT) 면 Pass. 읽기는 전체 공개. 클라 게이팅은 ADMIN_ONLY_CATEGORIES(Marketing.tsx:1847).",
  "COMM-07": "통합/코드: migration 20260701030000 — posts +language·translation_group_id·comment_count, comments +thread_id. BEFORE INSERT 트리거가 thread_id=COALESCE(글.translation_group_id, 글.id) 서버 강제, AFTER INSERT/DELETE sync_thread_comment_count(SECURITY DEFINER)가 그룹 전체 posts.comment_count 동기화. UGC(group=null)는 다국어 강제 안 함.",
  "WEB-04": "코드: functions/community/p/[id].ts·index.ts + _shared/ssr.ts — Supabase 조회 → HTMLRewriter 로 title·meta·OG·canonical·JSON-LD(공지/블로그=BlogPosting, 질문=QAPage, 그외=DiscussionForumPosting)·<noscript> 본문 주입 + hreflang 대체링크. 빌드 시 functions/→dist-web/functions/ 복사(copy-functions.mjs). UGC 이스케이프.",
  "WEB-05": "코드: functions/community-sitemap.xml.ts(동적 URL + xhtml:link hreflang) + robots.txt 사이트맵 등록 + public/_redirects 의 en/ja 정적 블로그 → 커뮤니티 301 확인.",
  "LIFE-04": "코드: src/lib/feedbackNudge.ts — shouldShowNudge(설치 3일+·2세션+·미완료), markNudgeDone(재노출 차단), recordSession. 저우선 양보(캘리브레이션/온보딩/중요배너)와 8초 지연은 호출부(App/배너)에서 확인. i18n app.feedbackNudge.* ko/en/ja.",
};

const src = readFileSync(TSX, "utf-8");
const start = src.indexOf("RAW_TEST_CASES");
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
