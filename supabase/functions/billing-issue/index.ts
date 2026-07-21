// POST /functions/v1/billing-issue
// 빌링키 발급 → 첫 정기결제 청구 → PRO 구독 활성화 (서버 신뢰 단일 경로)
//
// body: { authKey, customerKey, billingCycle: 'monthly' | 'yearly' }
// auth: Authorization: Bearer <user jwt> 필수
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, getUser } from "../_shared/admin.ts";
import { issueBillingKey, chargeBilling, cancelPayment, PRICE, type BillingCycle } from "../_shared/toss.ts";
import { nextPeriodEnd } from "../_shared/period.ts";
import { encryptSecret } from "../_shared/crypto.ts";
import { assertPaymentAllowed, PaymentBlockedError } from "../_shared/launch.ts";

// authKey 에서 결정적 orderId 를 만든다. 같은 결제 시도(=같은 authKey)의 중복
// 호출이 반드시 같은 orderId 를 갖게 하는 것이 목적 — 토스가 동일 orderId 재결제를
// 거부하므로 DB 선점과 별개로 결제사 층위에서도 이중청구가 막힌다.
// authKey 원문은 orderId 에 넣지 않는다(원장·로그에 인증정보가 남지 않도록).
// 토스 orderId 제약: 6~64자, 영숫자와 -_= 만 허용.
async function deterministicOrderId(authKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(authKey));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `order-${hex.slice(0, 32)}`;
}

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
    //
    // 멱등성 — 이 경로는 중복 호출되면 그대로 이중청구가 된다. 실제로 발생했다:
    // 결제 복귀 처리가 effect 안에 있어 StrictMode 가 두 번 실행했고, orderId 가
    // 매번 새로 생성돼 24ms 간격으로 별개 결제 2건(각 4,900원)이 승인됐다.
    // 프로덕션도 StrictMode 만 없을 뿐 네트워크 재시도·재마운트로 재현 가능하다.
    //
    // 두 층위로 막는다:
    //  (a) orderId 를 authKey 에서 결정적으로 도출 — authKey 는 결제 시도당
    //      유일하므로 중복 호출이 같은 orderId 를 만들고, 토스가 동일 orderId
    //      재결제를 거부한다(결제사 층위 차단).
    //  (b) 청구 전에 원장을 선점 — 기존 부분 유니크 인덱스
    //      idx_billing_history_order_id 를 그대로 활용한다. 유니크 위반이면
    //      다른 요청이 이미 이 시도를 처리 중이므로 청구하지 않고 반환한다.
    const orderId = await deterministicOrderId(authKey);
    const orderName = `BaroSit PRO ${cycle === "yearly" ? "연간" : "월간"} 구독`;

    const { error: claimErr } = await supabase.from("billing_history").insert({
      user_id: user.id,
      kind: "payment",
      order_id: orderId,
      amount,
      plan: "pro",
      billing_cycle: cycle,
      status: "pending",
      cash_receipt_issued: false,
      created_at: new Date().toISOString(),
    });
    if (claimErr) {
      // 23505 = unique_violation → 동일 authKey 로 이미 처리 중이거나 처리 완료.
      if ((claimErr as { code?: string }).code === "23505") {
        console.warn(`billing-issue 중복 호출 차단: orderId ${orderId}, user ${user.id}`);
        return json({ success: true, duplicate: true, plan: "pro", billingCycle: cycle });
      }
      throw new Error(`결제 선점 실패: ${claimErr.message}`);
    }

    let payment: Awaited<ReturnType<typeof chargeBilling>>;
    try {
      payment = await chargeBilling({
        billingKey,
        customerKey,
        amount,
        orderId,
        orderName,
        customerEmail: user.email ?? undefined,
      });
    } catch (chargeErr) {
      // 청구가 실패했으면 선점 행을 걷어낸다. 남겨두면 같은 authKey 로 재시도했을 때
      // 위 유니크 위반 분기가 "이미 처리됨"으로 오판해 청구 없이 성공을 반환한다.
      await supabase.from("billing_history").delete().eq("order_id", orderId);
      throw chargeErr;
    }

    // 3~4. 구독 활성화 + 결제 원장 적재.
    //   첫 청구는 이미 성공(카드에서 실제 출금)했으므로, 이 DB 쓰기가 실패하면
    //   "돈은 빠졌는데 PRO 활성화 안 됨" 상태가 된다. 이를 막기 위해 실패 시
    //   방금 청구한 결제를 즉시 취소(보상 트랜잭션)하고 원장에 환불로 남긴다(§7 C1).
    // 최초 결제이므로 앵커 없이 now 기준. 말일 클램프는 공유 로직에 있다
    // (1/31 결제 시 예전엔 3/3 이 됐다).
    const periodEnd = nextPeriodEnd(null, cycle);

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

      // 결제 원장 확정 — 위에서 pending 으로 선점해 둔 행을 완료로 올린다.
      // (insert 였다면 선점 행과 order_id 가 충돌해 실패하고, 아래 보상 로직이
      //  방금 성공한 결제를 불필요하게 환불해 버린다.)
      const { error: histErr } = await supabase.from("billing_history").update({
        payment_key: payment.paymentKey,
        status: "completed",
        created_at: new Date().toISOString(),
      }).eq("order_id", orderId);
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
