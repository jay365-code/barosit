// POST /functions/v1/subscription-manage
// 구독 해지 예약(cancel) / 해지 철회(resume) / 결제수단 삭제(delete_card).
//
// body: { action: 'cancel' | 'resume' | 'delete_card' }
// auth: Authorization: Bearer <user jwt> 필수
//
// cancel      : status='canceled' — 남은 기간까지 PRO 유지, 만료 시 정기청구 중단(charge-renewals 가 canceled 는 청구하지 않음)
// resume      : status='active'   — 해지 예약 철회
// delete_card : billing_key/customer_key/card_info 제거
//
// user_subscriptions 의 사용자 쓰기 정책을 철회했으므로(20260721040000) 구독 행을
// 바꾸는 모든 경로는 이 함수의 service_role 을 지난다. 예전에는 데스크톱이 클라이언트에서
// 직접 UPDATE 로 카드를 지웠는데, 같은 정책이 current_period_end 위조도 열어두고 있었다.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, getUser } from "../_shared/admin.ts";
import { sendUserEmail, tplCanceled } from "../_shared/email.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = adminClient();
    const user = await getUser(req, supabase);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { action, cycle } = await req.json();
    const ACTIONS = ["cancel", "resume", "delete_card", "schedule_cycle", "cancel_cycle_change"];
    if (!ACTIONS.includes(action)) {
      return json({ error: `action must be one of ${ACTIONS.join(", ")}` }, 400);
    }

    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("plan_id, status, current_period_end, billing_key, card_info, billing_cycle, pending_billing_cycle")
      .eq("user_id", user.id)
      .maybeSingle();

    // 주기 전환 예약 — 즉시 청구·환불 없이 "다음 결제일부터" 적용한다.
    // charge-renewals 가 갱신 시 pending_billing_cycle 을 소비한다.
    if (action === "schedule_cycle") {
      if (cycle !== "monthly" && cycle !== "yearly") {
        return json({ error: "cycle must be 'monthly' or 'yearly'" }, 400);
      }
      if (!sub || sub.plan_id !== "pro") {
        return json({ error: "PRO 구독 중에만 주기를 변경할 수 있습니다." }, 400);
      }
      // 해지 예약 상태면 갱신 자체가 없어 예약이 영원히 소비되지 않는다.
      if (sub.status === "canceled") {
        return json({ error: "해지 예약 중에는 주기를 변경할 수 없습니다. 먼저 해지를 철회해 주세요." }, 400);
      }
      // 현재 주기와 같으면 예약이 아니라 철회다 — 남겨두면 갱신 때 무의미한 분기를 탄다.
      const next = sub.billing_cycle === cycle ? null : cycle;
      const { error: schedErr } = await supabase
        .from("user_subscriptions")
        .update({ pending_billing_cycle: next, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (schedErr) throw new Error(`주기 예약 실패: ${schedErr.message}`);

      return json({
        success: true,
        action: "schedule_cycle",
        pendingBillingCycle: next,
        effectiveAt: sub.current_period_end ?? null,
      });
    }

    // 예약 철회 — 다음 갱신도 현재 주기 그대로 간다.
    if (action === "cancel_cycle_change") {
      const { error: clrErr } = await supabase
        .from("user_subscriptions")
        .update({ pending_billing_cycle: null, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (clrErr) throw new Error(`주기 예약 철회 실패: ${clrErr.message}`);
      return json({ success: true, action: "cancel_cycle_change", pendingBillingCycle: null });
    }

    // 결제수단 삭제는 PRO 가 아니어도(해지 후 FREE 로 내려온 뒤에도) 가능해야 한다.
    if (action === "delete_card") {
      // billing_key 든 card_info 든 하나라도 남아 있으면 지울 수 있어야 한다.
      // 과거 강등 경로가 billing_key 만 지워 card_info 가 남은 행이 존재하는데,
      // billing_key 만 보고 판정하면 그 유령 카드를 영영 못 지운다.
      if (!sub || (!sub.billing_key && !sub.card_info)) {
        return json({ error: "등록된 결제수단이 없습니다." }, 400);
      }
      // 활성 구독 중에는 삭제를 막는다. "구독 중인데 결제수단 없음"은 정합적이지 않은
      // 상태이고, 허용하면 다음 청구일에 반드시 실패 처리를 타면서 사용자는 왜
      // 강등됐는지 모른다. 교체는 언제든 가능하므로 막다른 길이 아니다.
      // (해지 예약·유예·만료 상태는 갱신 청구가 없으므로 삭제를 허용한다.)
      if (sub.status === "active") {
        return json({
          error: "구독이 활성 상태입니다. 먼저 구독을 해지하면 결제수단을 삭제할 수 있습니다.",
          code: "cancel_required",
        }, 409);
      }

      const { error: delErr } = await supabase.from("user_subscriptions").update({
        billing_key: null,
        customer_key: null,
        card_info: null,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id);
      if (delErr) throw new Error(delErr.message);

      await supabase.from("admin_notifications").insert({
        event_type: "cancellation",
        severity: "info",
        message: `결제수단 삭제: 사용자 ${user.email} 님이 등록된 결제 카드를 삭제했습니다.`,
        payload: { user_id: user.id, email: user.email, action: "delete_payment_method" },
      });

      return json({ success: true, action: "delete_card" });
    }

    if (!sub || sub.plan_id !== "pro") {
      return json({ error: "활성 PRO 구독이 없습니다." }, 400);
    }

    // 상태 가드. 예전에는 plan_id 만 보고 status 를 무시해서, 결제 실패로
    // grace_period 인 사용자가 resume 을 누르면 status='active' 가 되고
    // charge-renewals 가 유예 기간을 새로 7일 부여했다(강등 분기에 도달하지 못함).
    // 7일마다 resume 만 눌러 영구 무료 PRO 가 가능했다.
    if (action === "cancel" && sub.status !== "active") {
      return json({ error: "해지할 수 있는 활성 구독이 아닙니다." }, 400);
    }
    if (action === "resume" && sub.status !== "canceled") {
      return json({ error: "해지 예약 상태에서만 구독을 재개할 수 있습니다." }, 400);
    }
    // 이미 만료된 구독은 되살리지 않는다(다음 배치가 정리해야 할 대상).
    if (
      action === "resume" &&
      (!sub.current_period_end || new Date(sub.current_period_end) <= new Date())
    ) {
      return json({ error: "이용 기간이 만료되어 재개할 수 없습니다. 새로 구독해 주세요." }, 400);
    }

    const nextStatus = action === "cancel" ? "canceled" : "active";
    const { error } = await supabase.from("user_subscriptions").update({
      status: nextStatus,
      // 해지하면 갱신이 없으므로 주기 예약은 소비될 일이 없다. 남겨두면 나중에
      // 해지를 철회했을 때 사용자가 잊은 예약이 되살아나 예상치 못한 금액이 청구된다.
      ...(action === "cancel" ? { pending_billing_cycle: null } : {}),
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
    if (error) throw new Error(error.message);

    // 해지 예약 접수 안내 메일 (§11 H2) — 발송 실패해도 처리 결과엔 영향 없음
    if (action === "cancel") {
      const m = tplCanceled(sub.current_period_end);
      await sendUserEmail(user.email, m.subject, m.html);
    }

    return json({ success: true, status: nextStatus });
  } catch (e: any) {
    console.error("subscription-manage error:", e?.message ?? e);
    return json({ error: e?.message ?? String(e) }, 400);
  }
});
