// POST /functions/v1/billing-issue
// 빌링키 발급 → 첫 정기결제 청구 → PRO 구독 활성화 (서버 신뢰 단일 경로)
//
// body: { authKey, customerKey, billingCycle: 'monthly' | 'yearly' }
// auth: Authorization: Bearer <user jwt> 필수
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, getUser, makeOrderId } from "../_shared/admin.ts";
import { issueBillingKey, chargeBilling, PRICE, type BillingCycle } from "../_shared/toss.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = adminClient();
    const user = await getUser(req, supabase);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { authKey, customerKey, billingCycle, mode } = await req.json();
    if (!authKey || !customerKey) return json({ error: "authKey/customerKey required" }, 400);

    const cycle: BillingCycle = billingCycle === "yearly" ? "yearly" : "monthly";
    const amount = PRICE[cycle];

    // 1. 빌링키 발급 (Toss S2S)
    const { billingKey, card } = await issueBillingKey(authKey, customerKey);

    const cardInfoOnly = {
      company: card.company ?? null,
      number: card.number ?? null,
      cardType: card.cardType ?? null,
      ownerType: card.ownerType ?? null,
    };

    // 결제수단 변경 모드 — 청구/플랜변경 없이 카드(billingKey)만 교체
    if (mode === "update_card") {
      const { error: updErr } = await supabase.from("user_subscriptions").update({
        billing_key: billingKey,
        customer_key: customerKey,
        card_info: cardInfoOnly,
        // 유예 상태였다면 카드 재등록으로 active 복귀
        status: "active",
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id);
      if (updErr) throw new Error(`카드 교체 실패: ${updErr.message}`);

      await supabase.from("billing_history").insert({
        user_id: user.id,
        kind: "card_updated",
        order_id: `card-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        amount: 0,
        status: "completed",
        cash_receipt_issued: false,
        created_at: new Date().toISOString(),
      });

      return json({ success: true, mode: "update_card", card: cardInfoOnly });
    }

    // 2. 첫 결제 즉시 청구
    const orderId = makeOrderId("order");
    const orderName = `BaroSit PRO ${cycle === "yearly" ? "연간" : "월간"} 구독`;
    const payment = await chargeBilling({
      billingKey,
      customerKey,
      amount,
      orderId,
      orderName,
      customerEmail: user.email ?? undefined,
    });

    // 3. 구독 활성화 (service_role → 트리거 통과)
    const periodEnd = new Date();
    if (cycle === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);

    const { error: subErr } = await supabase.from("user_subscriptions").upsert({
      user_id: user.id,
      plan_id: "pro",
      status: "active",
      billing_key: billingKey,
      customer_key: customerKey,
      billing_cycle: cycle,
      card_info: cardInfoOnly,
      current_period_end: periodEnd.toISOString(),
      grace_period_until: null,
      dunning_attempts: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (subErr) throw new Error(`구독 저장 실패: ${subErr.message}`);

    // 4. 결제 원장 적재 (멱등성: order_id unique)
    await supabase.from("billing_history").insert({
      user_id: user.id,
      kind: "payment",
      order_id: orderId,
      payment_key: payment.paymentKey,
      amount,
      plan: "pro",
      billing_cycle: cycle,
      status: "completed",
      cash_receipt_issued: false,
      created_at: new Date().toISOString(),
    });

    return json({
      success: true,
      plan: "pro",
      billingCycle: cycle,
      currentPeriodEnd: periodEnd.toISOString(),
      card: cardInfoOnly,
    });
  } catch (e: any) {
    console.error("billing-issue error:", e?.message ?? e);
    return json({ error: e?.message ?? String(e) }, 400);
  }
});
