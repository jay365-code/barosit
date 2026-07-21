// 로컬 플랜 캐시(barosit:subscription_plan)와 서버 실효 플랜의 불일치 보고.
//
// 배경: 네 곳(useEntitlement · Marketing · PricingView · ProfileView)이 각자
// "캐시는 pro 인데 서버는 free" 를 발견하면 무조건 critical + "불법 변조 정황" 으로
// admin_notifications 에 적재했다. 그런데 이 상태는 정상 사용 중에도 자연히 생긴다 —
// 환불·해지 만료·유예 만료로 강등된 직후, 또는 staged 모드에서 캐시가 앞설 때.
// 실제로 심사 준비 중 정상 테스트만으로 critical 경보가 7건 쌓였고, 전부 오탐이었다.
//
// 문제는 두 가지다. ① 진짜 사고가 오탐 더미에 묻힌다. ② 캐시 불일치를 "불법"으로
// 단정하는 문구가 사실과 다르다. 캐시를 스스로 고치는 건 자해적 행위이기도 하다 —
// 서버가 매번 재검증하므로 권한 상승이 되지 않는다.
//
// 그래서 결제 이력으로 갈라 판단한다.
//   결제 이력 있음 → info.    강등 이후의 캐시 잔상. 자동 동기화하면 끝.
//   결제 이력 없음 → warning. 유료였던 적이 없는 계정에 PRO 캐시가 있는 건 이상하다.
// critical 은 쓰지 않는다. 강등 자체는 어느 경우든 그대로 수행된다.
//
// 같은 사용자가 화면을 옮겨 다니면 같은 불일치가 여러 번 보고되므로(어드민 계정에서
// 5회 중복 발생) 최근 보고가 있으면 건너뛴다.
import type { SupabaseClient } from "@supabase/supabase-js";

const DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000; // 6시간

export async function reportPlanMismatch(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  context: string,
): Promise<void> {
  try {
    const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const { data: recent } = await supabase
      .from("admin_notifications")
      .select("id")
      .eq("event_type", "plan_cache_mismatch")
      .contains("payload", { user_id: user.id })
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length > 0) return;

    // 유료 결제 이력이 한 번이라도 있으면 강등 이후의 잔상으로 본다.
    const { data: paid } = await supabase
      .from("billing_history")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "payment")
      .limit(1);
    const hadPayment = !!paid && paid.length > 0;

    await supabase.from("admin_notifications").insert({
      event_type: "plan_cache_mismatch",
      severity: hadPayment ? "info" : "warning",
      message: hadPayment
        ? `플랜 캐시 불일치(${context}): ${user.email ?? user.id} — 로컬 PRO ↔ 서버 FREE. 강등 이후 잔상으로 보이며 자동 동기화했습니다.`
        : `플랜 캐시 불일치(${context}): ${user.email ?? user.id} — 결제 이력이 없는 계정에서 로컬 PRO 캐시가 발견되어 자동 강등했습니다.`,
      payload: {
        user_id: user.id,
        email: user.email ?? null,
        context,
        local_plan: "pro",
        server_plan: "free",
        had_payment: hadPayment,
        detected_at: new Date().toISOString(),
      },
    });
  } catch {
    /* 보고 실패가 강등을 막아서는 안 된다 */
  }
}
