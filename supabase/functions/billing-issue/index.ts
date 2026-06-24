// POST /functions/v1/billing-issue
// 빌링키 발급 → 첫 정기결제 청구 → PRO 구독 활성화 (서버 신뢰 단일 경로)
//
// body: { authKey, customerKey, billingCycle: 'monthly' | 'yearly' }
// auth: Authorization: Bearer <user jwt> 필수
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, getUser, makeOrderId } from "../_shared/admin.ts";
import { issueBillingKey, chargeBilling, cancelPayment, PRICE, type BillingCycle } from "../_shared/toss.ts";
import { encryptSecret } from "../_shared/crypto.ts";
import { assertPaymentAllowed, PaymentBlockedError } from "../_shared/launch.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = adminClient();
    const user = await getUser(req, supabase);
    if (!user) return json({ error: "Unauthorized" }, 401);

    // 런치 모드 가드: staged 면 테스터만, beta_free 면 차단(전원 이미 PRO).
    // UI 를 숨겨도 직접 호출될 수 있으므로 서버에서 강제한다.
    try {
      await assertPaymentAllowed(supabase, user.id);
    } catch (e) {
      if (e instanceof PaymentBlockedError) return json({ error: e.message }, 403);
      throw e;
    }

    const { authKey, customerKey, billingCycle, mode } = await req.json();
    if (!authKey || !customerKey) return json({ error: "authKey/customerKey required" }, 400);

    const cycle: BillingCycle = billingCycle === "yearly" ? "yearly" : "monthly";
    const amount = PRICE[cycle];

    // 1. 빌링키 발급 (Toss S2S)
    const { billingKey, card } = await issueBillingKey(authKey, customerKey);

    // 저장용 암호문(ENCRYPTION_KEY 미설정 시 평문 폴백). 청구 호출엔 평문을 그대로 사용.
    const encBillingKey = await encryptSecret(billingKey);
    const encCustomerKey = await encryptSecret(customerKey);

    const cardInfoOnly = {
      company: card.company ?? null,
      number: card.number ?? null,
      cardType: card.cardType ?? null,
      ownerType: card.ownerType ?? null,
    };

    // 결제수단 변경 모드 — 청구/플랜변경 없이 카드(billingKey)만 교체
    if (mode === "update_card") {
      const { error: updErr } = await supabase.from("user_subscriptions").update({
        billing_key: encBillingKey,
        customer_key: encCustomerKey,
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

    // 3~4. 구독 활성화 + 결제 원장 적재.
    //   첫 청구는 이미 성공(카드에서 실제 출금)했으므로, 이 DB 쓰기가 실패하면
    //   "돈은 빠졌는데 PRO 활성화 안 됨" 상태가 된다. 이를 막기 위해 실패 시
    //   방금 청구한 결제를 즉시 취소(보상 트랜잭션)하고 원장에 환불로 남긴다(§7 C1).
    const periodEnd = new Date();
    if (cycle === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);

    try {
      const { error: subErr } = await supabase.from("user_subscriptions").upsert({
        user_id: user.id,
        plan_id: "pro",
        status: "active",
        billing_key: encBillingKey,
        customer_key: encCustomerKey,
        billing_cycle: cycle,
        card_info: cardInfoOnly,
        current_period_end: periodEnd.toISOString(),
        grace_period_until: null,
        dunning_attempts: 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (subErr) throw new Error(`구독 저장 실패: ${subErr.message}`);

      // 결제 원장 적재 (멱등성: order_id unique)
      const { error: histErr } = await supabase.from("billing_history").insert({
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
      if (histErr) throw new Error(`원장 적재 실패: ${histErr.message}`);
    } catch (dbErr: any) {
      // 보상: 방금 성공한 첫 청구를 전액 취소해 사용자 손실을 0 으로 되돌린다.
      let compensated = false;
      try {
        await cancelPayment(payment.paymentKey, "구독 활성화 실패에 따른 자동 환불(보상)", amount);
        compensated = true;
      } catch (refundErr: any) {
        // 환불까지 실패 → 수동 개입 필요. paymentKey 를 반드시 남긴다.
        await supabase.from("admin_notifications").insert({
          event_type: "system_error",
          severity: "critical",
          message: `결제 후 활성화 실패 + 자동환불 실패 — 수동 환불 필요. user ${user.id}, paymentKey ${payment.paymentKey}, orderId ${orderId}. ${refundErr?.message ?? ""}`,
          payload: { user_id: user.id, payment_key: payment.paymentKey, order_id: orderId, amount },
        });
      }
      // 실패한 결제를 원장에 흔적으로 남겨 추적 가능하게 한다(멱등: order_id).
      await supabase.from("billing_history").upsert({
        user_id: user.id, kind: "payment", order_id: orderId,
        payment_key: payment.paymentKey, amount, plan: "pro", billing_cycle: cycle,
        status: compensated ? "refunded" : "pending",
        refunded_amount: compensated ? amount : null,
        refunded_at: compensated ? new Date().toISOString() : null,
        cash_receipt_issued: false, created_at: new Date().toISOString(),
      }, { onConflict: "order_id" });

      throw new Error(
        compensated
          ? "구독 활성화에 실패해 결제를 자동 환불했습니다. 다시 시도해 주세요."
          : `${dbErr?.message ?? "활성화 실패"} (결제 자동환불도 실패 — 고객센터가 곧 처리합니다)`,
      );
    }

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
