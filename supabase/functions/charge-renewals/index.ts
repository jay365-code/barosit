// POST /functions/v1/charge-renewals  (pg_cron 매일 호출, service_role)
// 만기 도래 구독 정기청구 + 더닝(결제 실패 시 7일 유예 → FREE 강등).
//
// 대상: status in ('active','grace_period') 이고 current_period_end <= now()
//  - active   : 청구 성공 → 기간 연장 / 실패 → grace_period + 유예 7일 시작
//  - grace    : 재청구 성공 → active 복귀 / 실패 → 첫 실패 7일 초과 시 FREE 강등
//  - canceled : 청구하지 않음 (만료일 도달 시 자연 만료)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, makeOrderId } from "../_shared/admin.ts";
import { chargeBilling, PRICE, type BillingCycle } from "../_shared/toss.ts";

const GRACE_DAYS = 7;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = adminClient();
    const nowIso = new Date().toISOString();

    const { data: due } = await supabase
      .from("user_subscriptions")
      .select("user_id, billing_key, customer_key, billing_cycle, current_period_end, status, grace_period_until, dunning_attempts")
      .in("status", ["active", "grace_period"])
      .lte("current_period_end", nowIso);

    const results = { charged: 0, graced: 0, downgraded: 0, skipped: 0 };

    for (const sub of due ?? []) {
      if (!sub.billing_key || !sub.customer_key) { results.skipped++; continue; }

      const cycle: BillingCycle = sub.billing_cycle === "yearly" ? "yearly" : "monthly";
      const amount = PRICE[cycle];
      const orderId = makeOrderId("renew");

      try {
        const payment = await chargeBilling({
          billingKey: sub.billing_key,
          customerKey: sub.customer_key,
          amount,
          orderId,
          orderName: `BaroSit PRO ${cycle === "yearly" ? "연간" : "월간"} 정기결제`,
        });

        const periodEnd = new Date();
        if (cycle === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        else periodEnd.setMonth(periodEnd.getMonth() + 1);

        await supabase.from("user_subscriptions").update({
          status: "active",
          current_period_end: periodEnd.toISOString(),
          grace_period_until: null,
          dunning_attempts: 0,
          updated_at: new Date().toISOString(),
        }).eq("user_id", sub.user_id);

        await supabase.from("billing_history").insert({
          user_id: sub.user_id, kind: "payment", order_id: orderId,
          payment_key: payment.paymentKey, amount, plan: "pro",
          billing_cycle: cycle, status: "completed", cash_receipt_issued: false,
          created_at: new Date().toISOString(),
        });
        results.charged++;
      } catch (chargeErr: any) {
        // 결제 실패 → 더닝
        const attempts = (sub.dunning_attempts ?? 0) + 1;
        const firstGrace = sub.grace_period_until ?? null;
        const graceExpired = firstGrace && new Date(firstGrace) <= new Date();

        if (sub.status === "active" || !firstGrace) {
          // 첫 실패 → 유예 시작
          const graceUntil = new Date();
          graceUntil.setDate(graceUntil.getDate() + GRACE_DAYS);
          await supabase.from("user_subscriptions").update({
            status: "grace_period",
            grace_period_until: graceUntil.toISOString(),
            dunning_attempts: attempts,
            updated_at: new Date().toISOString(),
          }).eq("user_id", sub.user_id);
          results.graced++;
        } else if (graceExpired) {
          // 유예 만료 → FREE 강등 + 빌링키 비활성화
          await supabase.from("user_subscriptions").update({
            plan_id: "free", status: "none",
            billing_key: null, customer_key: null,
            current_period_end: null, grace_period_until: null,
            dunning_attempts: attempts,
            updated_at: new Date().toISOString(),
          }).eq("user_id", sub.user_id);
          results.downgraded++;
        } else {
          // 유예 중 재시도 실패 (아직 7일 안 지남)
          await supabase.from("user_subscriptions").update({
            dunning_attempts: attempts, updated_at: new Date().toISOString(),
          }).eq("user_id", sub.user_id);
          results.skipped++;
        }

        await supabase.from("admin_notifications").insert({
          event_type: "payment_failed", severity: "warning",
          message: `정기결제 실패 (시도 ${attempts}회): user ${sub.user_id}. ${chargeErr?.message ?? ""}`,
          payload: { user_id: sub.user_id, attempts, cycle },
        });
      }
    }

    return json({ success: true, ...results, processed: due?.length ?? 0 });
  } catch (e: any) {
    console.error("charge-renewals error:", e?.message ?? e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
