// 런치 모드 토글 (베타 무료 ↔ 유료 정식)
//
// 출시 전략 전환을 코드 한 지점으로 제어한다.
//  - beta_free : 페이월 비노출 + 전원 PRO 기능 개방 (결제 백엔드 미완성 동안 사용자 받기)
//  - paid      : 정상 구독 게이팅 (구독자만 PRO)
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

export type LaunchMode = "beta_free" | "paid";

const LS_KEY = "barosit:launch_mode";
export const LAUNCH_MODE_CHANGED_EVENT = "barosit:launch-mode-changed";

const ENV_MODE: LaunchMode =
  (import.meta.env.VITE_LAUNCH_MODE as string) === "beta_free" ? "beta_free" : "paid";

function readCache(): LaunchMode | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v === "beta_free" || v === "paid" ? v : null;
  } catch {
    return null;
  }
}

// 동기 초기값: 캐시 > env. 원격값은 refreshLaunchMode() 로 비동기 갱신.
let currentMode: LaunchMode = readCache() ?? ENV_MODE;

export function getLaunchMode(): LaunchMode {
  return currentMode;
}

export function isBetaFree(): boolean {
  return currentMode === "beta_free";
}

function setMode(mode: LaunchMode): void {
  if (mode === currentMode) return;
  currentMode = mode;
  try {
    localStorage.setItem(LS_KEY, mode);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LAUNCH_MODE_CHANGED_EVENT));
  }
}

// 부팅 시 1회 호출. 원격값을 읽어 모드를 갱신한다. 실패해도 조용히 캐시/env 유지.
export async function refreshLaunchMode(): Promise<LaunchMode> {
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "launch_mode")
      .maybeSingle();
    if (!error && data && (data.value === "beta_free" || data.value === "paid")) {
      setMode(data.value as LaunchMode);
    }
  } catch {
    /* 네트워크/RLS 실패 → 캐시/env 유지 */
  }
  return currentMode;
}

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
// isPro 판정을 이 함수로 일원화한다. 베타 모드면 row 와 무관하게 PRO 를 돌려줘
// 전원 기능 개방. (UI 페이월 노출 여부는 isBetaFree() 로 별도 제어 — 관심사 분리)

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

  const ok =
    row.status === "active" ||
    row.status === "grace_period" ||
    (row.status === "canceled" && periodValid);

  return ok ? "pro" : "free";
}
