// 런치 모드 토글 (베타 무료 ↔ 시험 ↔ 유료 정식)
//
// 출시 전략 전환을 코드 한 지점으로 제어한다.
//  - beta_free : 페이월 비노출 + 전원 PRO 기능 개방 (결제 백엔드 미완성 동안 사용자 받기)
//  - staged    : 일반 사용자는 beta_free 와 동일(전원 PRO·결제 비노출).
//                테스터(profiles.is_beta_tester / is_admin)만 paid 게이팅 + 결제 UI 노출.
//                → 토스 라이브 승인 전, 소수 테스터가 샌드박스로 결제 전 과정을 시험.
//  - paid      : 정상 구독 게이팅 (구독자만 PRO)
//
// staged 는 "사용자별 실효 모드"로 해석된다(getEffectiveLaunchMode):
//   테스터 → paid, 비테스터 → beta_free. 따라서 기존 isBetaFree()/resolveEffectivePlan()
//   호출부를 그대로 두어도 staged 가 올바르게 동작한다.
//
// 플래그 해석 우선순위 (하이브리드):
//   원격값(Supabase app_config) > localStorage 캐시 > VITE_LAUNCH_MODE(env) > 'paid'(안전 기본값)
//
// 빌드타임 env 를 기본값으로, 부팅 시 원격값이 있으면 override → 관리자가
// admin 에서 즉시 전환(이미 설치된 데스크톱 앱 포함). 네트워크 실패 시 캐시/env 로
// 안전 폴백하므로 첫 로드 깜빡임/오프라인 문제가 없다.
//
// grandfather(베타 가입자 영구 무료) 는 하지 않는다 — paid 로 내리면
// resolveEffectivePlan 이 비구독자에게 자동으로 free 를 돌려줘 일괄 강등된다.

import { supabase } from "./auth/supabase";

export type LaunchMode = "beta_free" | "staged" | "paid";

const LS_KEY = "barosit:launch_mode";
export const LAUNCH_MODE_CHANGED_EVENT = "barosit:launch-mode-changed";

function isLaunchMode(v: unknown): v is LaunchMode {
  return v === "beta_free" || v === "staged" || v === "paid";
}

const ENV_MODE: LaunchMode =
  (import.meta.env.VITE_LAUNCH_MODE as string) === "beta_free" ? "beta_free" : "paid";

function readCache(): LaunchMode | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    return isLaunchMode(v) ? v : null;
  } catch {
    return null;
  }
}

// 동기 초기값: 캐시 > env. 원격값은 refreshLaunchMode() 로 비동기 갱신.
let currentMode: LaunchMode = readCache() ?? ENV_MODE;

// 현재 로그인 사용자가 테스터인지 (staged 모드 해석에만 사용).
// 기본 false → staged 는 안전하게 beta_free 처럼 보임(결제 비노출). 비테스터가 캐시를
// 위조해 true 로 만들어도 resolveEffectivePlan 이 paid 로직(구독 없으면 free)을 적용하고
// 결제 edge function 은 서버에서 테스터를 재검증하므로 권한 상승이 되지 않는다(자해적).
let isTesterFlag = false;

// "일반 사용자로 미리보기" 오버라이드 — 어드민/테스터가 staged 에서 일반 사용자(비테스터)
// 화면을 별도 계정 없이 확인하기 위한 로컬 전용 스위치. 켜지면 테스터 판정을 강제로 false
// 로 본다(=staged 가 beta_free 로 펼쳐짐). UI 전용일 뿐 서버 권한은 그대로(어차피 미리보기
// 중엔 결제 UI 가 숨겨져 결제를 시도할 일이 없다).
const PREVIEW_KEY = "barosit:preview_as_user";
function readPreview(): boolean {
  try {
    return localStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}
let previewAsUser = readPreview();

// 실효 테스터 = 실제 테스터 AND 미리보기 오버라이드가 꺼져 있을 때.
function effectiveTester(): boolean {
  return isTesterFlag && !previewAsUser;
}

export function getLaunchMode(): LaunchMode {
  return currentMode;
}

// 사용자별 실효 모드. staged 는 (실효)테스터 여부로 paid/beta_free 로 펼쳐진다.
export function getEffectiveLaunchMode(): LaunchMode {
  if (currentMode === "staged") return effectiveTester() ? "paid" : "beta_free";
  return currentMode;
}

export function isBetaFree(): boolean {
  return getEffectiveLaunchMode() === "beta_free";
}

export function isTester(): boolean {
  return effectiveTester();
}

// 실제(서버) 테스터 여부 — 미리보기 토글 노출 대상(어드민/테스터)인지 판단용.
export function isRealTester(): boolean {
  return isTesterFlag;
}

export function isPreviewAsUser(): boolean {
  return previewAsUser;
}

export function setPreviewAsUser(on: boolean): void {
  if (on === previewAsUser) return;
  previewAsUser = on;
  try {
    if (on) localStorage.setItem(PREVIEW_KEY, "1");
    else localStorage.removeItem(PREVIEW_KEY);
  } catch {
    /* ignore */
  }
  emitChange();
}

function emitChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LAUNCH_MODE_CHANGED_EVENT));
  }
}

function setMode(mode: LaunchMode): void {
  if (mode === currentMode) return;
  currentMode = mode;
  try {
    localStorage.setItem(LS_KEY, mode);
  } catch {
    /* ignore */
  }
  emitChange();
}

function setTester(next: boolean): void {
  if (next === isTesterFlag) return;
  isTesterFlag = next;
  // staged 에서만 실효 모드가 바뀌므로, staged 일 때만 UI 재계산을 알린다.
  if (currentMode === "staged") emitChange();
}

// 부팅 시 1회 호출. 원격값을 읽어 모드를 갱신한다. 실패해도 조용히 캐시/env 유지.
export async function refreshLaunchMode(): Promise<LaunchMode> {
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "launch_mode")
      .maybeSingle();
    if (!error && data && isLaunchMode(data.value)) {
      setMode(data.value);
    }
  } catch {
    /* 네트워크/RLS 실패 → 캐시/env 유지 */
  }
  return currentMode;
}

// 현재 사용자의 테스터 여부를 서버에서 읽어 갱신. staged 모드 해석에 사용.
// 비로그인/오프라인이면 보수적으로 false(= staged 를 beta_free 로 취급).
export async function refreshTesterStatus(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setTester(false);
      return false;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("is_admin, is_beta_tester")
      .eq("id", session.user.id)
      .maybeSingle();
    if (!error && data) {
      setTester(!!data.is_admin || !!data.is_beta_tester);
    }
  } catch {
    /* 조회 실패 → 현재 값 유지 */
  }
  return isTesterFlag;
}

// 인증 상태 변경 시 테스터 여부 자동 재동기화 (로그인/로그아웃 후 staged UI 정합).
// 모듈 로드 시 1회만 구독한다.
let testerSyncStarted = false;
export function startTesterAutoSync(): void {
  if (testerSyncStarted) return;
  testerSyncStarted = true;
  try {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "INITIAL_SESSION") {
        void refreshTesterStatus();
      }
    });
  } catch {
    /* supabase 미초기화 환경 — 무시 */
  }
}
startTesterAutoSync();

// 관리자 토글: 원격값 upsert 후 로컬 즉시 반영. is_admin() RLS 로 보호됨.
export async function setLaunchModeRemote(mode: LaunchMode): Promise<void> {
  const { error } = await supabase
    .from("app_config")
    .upsert(
      { key: "launch_mode", value: mode, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) throw error;
  setMode(mode);
}

// ─── 구독 플랜 판정 (단일 진실원) ──────────────────────────────────────────
//
// 기존에 App.tsx / Marketing ×3 / ProfileView / PricingView 5곳에 복붙돼 있던
// isPro 판정을 이 함수로 일원화한다. 실효 모드가 beta_free 면 row 와 무관하게 PRO 를
// 돌려줘 전원 기능 개방(staged 의 비테스터 포함). (UI 페이월 노출 여부는 isBetaFree()
// 로 별도 제어 — 관심사 분리)

export interface SubscriptionRow {
  plan_id?: string | null;
  status?: string | null;
  current_period_end?: string | null;
}

export function resolveEffectivePlan(row: SubscriptionRow | null | undefined): "free" | "pro" {
  if (isBetaFree()) return "pro";
  if (!row || !row.plan_id) return "free";

  const planIsPro = row.plan_id === "pro" || row.plan_id.startsWith("pro");
  if (!planIsPro) return "free";

  const periodValid =
    !!row.current_period_end && new Date(row.current_period_end) > new Date();

  // active 도 기간을 검사한다. 예전에는 status 만 보고 PRO 를 내줬는데, 정기청구
  // 배치가 멈추면 만료된 구독이 무기한 PRO 로 남는다(프로덕션에서 21일간 발생).
  // 정상 청구되면 current_period_end 가 미래로 갱신되므로 구독자에겐 영향이 없다.
  // grace_period 는 결제 실패 유예 중이라 기간이 지나 있는 게 정상이므로 제외한다.
  const ok =
    (row.status === "active" && periodValid) ||
    row.status === "grace_period" ||
    (row.status === "canceled" && periodValid);

  return ok ? "pro" : "free";
}
