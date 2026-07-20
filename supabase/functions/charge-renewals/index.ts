// POST /functions/v1/charge-renewals  (pg_cron 매일 호출, service_role)
// 만기 도래 구독 정기청구 + 더닝(결제 실패 시 7일 유예 → FREE 강등).
//
// 대상: status in ('active','grace_period','canceled') 이고 current_period_end <= now()
//  - active   : 청구 성공 → 기간 연장 / 실패 → grace_period + 유예 7일 시작
//  - grace    : 2일 간격으로 최대 3회 재청구. 성공 → active 복귀 /
//               유예 7일 초과 또는 3회 초과 실패 → FREE 강등
//  - canceled : 청구하지 않고 만료 시 FREE 정리 (§7 H1)
// 빌링키/customerKey 는 암호화 저장(§ crypto)되어 청구 전 복호화한다.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, makeOrderId, isServiceRole } from "../_shared/admin.ts";
import { chargeBilling, PRICE, type BillingCycle } from "../_shared/toss.ts";
import { sendUserEmail, tplPaymentFailed, tplDowngraded } from "../_shared/email.ts";
import { decryptSecret } from "../_shared/crypto.ts";

const GRACE_DAYS = 7;
// 더닝(재시도) 제어 (§11 M3): 최소 재시도 간격 2일 + 최대 시도 횟수 3회.
// 이전엔 grace 구독이 매일 재청구돼 카드사 위험신호가 될 수 있었다.
const DUNNING_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_DUNNING_ATTEMPTS = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // 청구 배치는 pg_cron 전용이다. verify_jwt 만으로는 로그인한 아무 사용자나
  // 임의 시점에 전체 만기 구독의 청구·더닝을 강제 실행할 수 있었다.
  if (!isServiceRole(req)) return json({ error: "Forbidden" }, 403);

  try {
    const supabase = adminClient();
    const nowIso = new Date().toISOString();

    const { data: due } = await supabase
      .from("user_subscriptions")
      .select("user_id, billing_key, customer_key, billing_cycle, current_period_end, status, grace_period_until, dunning_attempts, last_dunning_at")
      .in("status", ["active", "grace_period", "canceled"])
      .lte("current_period_end", nowIso);

    const results = { charged: 0, graced: 0, downgraded: 0, skipped: 0, cleaned: 0 };

    for (const sub of due ?? []) {
      // 해지 예약(canceled)이 만료일에 도달 → 청구하지 않고 FREE 로 정리한다.
      // (이전엔 청구 대상에서 빠지기만 해 plan_id='pro', status='canceled' 행이
      //  영구 잔존했다 — 운영 통계/세그먼트 오염. §7 H1)
      if (sub.status === "canceled") {
        await supabase.from("user_subscriptions").update({
          plan_id: "free", status: "none",
          billing_key: null, customer_key: null,
          current_period_end: null, grace_period_until: null,
          updated_at: new Date().toISOString(),
        }).eq("user_id", sub.user_id);
        results.cleaned++;
        continue;
      }

      if (!sub.billing_key || !sub.customer_key) { results.skipped++; continue; }

      // 더닝 재시도 최소 간격(2일) 가드 — grace 중 매일 재청구 방지(§11 M3).
      if (sub.status === "grace_period" && sub.last_dunning_at) {
        if (Date.now() - new Date(sub.last_dunning_at).getTime() < DUNNING_INTERVAL_MS) {
          results.skipped++;
          continue;
        }
      }

      // 저장된 빌링키/customerKey 복호화 (암호화 미적용 시 평문 그대로 반환)
      const billingKey = await decryptSecret(sub.billing_key);
      const customerKey = await decryptSecret(sub.customer_key);
      if (!billingKey || !customerKey) {
        console.error("charge-renewals: 키 복호화 실패 user", sub.user_id);
        results.skipped++;
        continue;
      }

      const cycle: BillingCycle = sub.billing_cycle === "yearly" ? "yearly" : "monthly";
      const amount = PRICE[cycle];
      const orderId = makeOrderId("renew");

      try {
        const payment = await chargeBilling({
          billingKey,
          customerKey,
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
          last_dunning_at: null,
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

        // 사용자 알림 메일 발송용 이메일 조회 (실패해도 더닝 본 로직엔 영향 없음)
        let userEmail: string | null = null;
        try {
          const { data: u } = await supabase.auth.admin.getUserById(sub.user_id);
          userEmail = u?.user?.email ?? null;
        } catch { /* 무시 */ }

        const nowIsoTs = new Date().toISOString();
        if (sub.status === "active" || !firstGrace) {
          // 첫 실패 → 유예 시작
          const graceUntil = new Date();
          graceUntil.setDate(graceUntil.getDate() + GRACE_DAYS);
          await supabase.from("user_subscriptions").update({
            status: "grace_period",
            grace_period_until: graceUntil.toISOString(),
            dunning_attempts: attempts,
            last_dunning_at: nowIsoTs,
            updated_at: nowIsoTs,
          }).eq("user_id", sub.user_id);
          // 결제 실패 + 카드 갱신 유도 메일 (§11 H2)
          const m = tplPaymentFailed(graceUntil.toISOString());
          await sendUserEmail(userEmail, m.subject, m.html);
          results.graced++;
        } else if (graceExpired || attempts >= MAX_DUNNING_ATTEMPTS) {
          // 유예 만료 또는 최대 재시도(3회) 초과 → FREE 강등 + 빌링키 비활성화 (§11 M3)
          await supabase.from("user_subscriptions").update({
            plan_id: "free", status: "none",
            billing_key: null, customer_key: null,
            current_period_end: null, grace_period_until: null,
            dunning_attempts: attempts,
            last_dunning_at: nowIsoTs,
            updated_at: nowIsoTs,
          }).eq("user_id", sub.user_id);
          // FREE 강등 안내 메일
          const m = tplDowngraded();
          await sendUserEmail(userEmail, m.subject, m.html);
          results.downgraded++;
        } else {
          // 유예 중 재시도 실패 (아직 7일·최대횟수 전) — 다음 간격까지 대기
          await supabase.from("user_subscriptions").update({
            dunning_attempts: attempts,
            last_dunning_at: nowIsoTs,
            updated_at: nowIsoTs,
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
