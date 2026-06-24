// 런치 모드 서버측 판정 — 결제 진입(billing-issue)을 staged 모드에서 테스터로 제한.
//
// 클라이언트 UI 가 결제 버튼을 숨겨도 edge function 은 직접 호출될 수 있으므로,
// "테스터만 결제"는 반드시 서버에서 강제해야 한다.
//
// 정책:
//   paid       → 누구나 결제 허용(정식)
//   staged     → 테스터(profiles.is_beta_tester | is_admin)만 허용
//   beta_free  → 누구도 결제 불가(전원 이미 PRO — 오결제 방지)
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type LaunchMode = "beta_free" | "staged" | "paid";

export async function getLaunchModeServer(supabase: SupabaseClient): Promise<LaunchMode> {
  const { data } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "launch_mode")
    .maybeSingle();
  const v = data?.value;
  return v === "beta_free" || v === "staged" ? v : "paid"; // 미설정/이상값 → 안전하게 paid
}

export async function isTesterServer(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("is_admin, is_beta_tester")
    .eq("id", userId)
    .maybeSingle();
  return !!(data?.is_admin || data?.is_beta_tester);
}

export class PaymentBlockedError extends Error {
  constructor(public mode: LaunchMode) {
    super(
      mode === "staged"
        ? "베타 시험 기간 중에는 테스터로 지정된 계정만 결제할 수 있습니다."
        : "현재 무료 베타 기간에는 결제가 필요하지 않습니다.",
    );
    this.name = "PaymentBlockedError";
  }
}

// 결제 허용 여부 검증. 차단 시 PaymentBlockedError 를 던진다(호출부에서 403 처리).
export async function assertPaymentAllowed(supabase: SupabaseClient, userId: string): Promise<void> {
  const mode = await getLaunchModeServer(supabase);
  if (mode === "paid") return;
  if (mode === "staged" && (await isTesterServer(supabase, userId))) return;
  throw new PaymentBlockedError(mode);
}
