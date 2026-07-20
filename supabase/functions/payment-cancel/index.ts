// POST /functions/v1/payment-cancel
// 환불 + FREE 강등. 두 갈래로 처리한다.
//   - 청약철회 : 결제 7일 이내 + 미사용(모니터링 기록 0) → 전액 환불
//   - 중도 해지 : 연간 구독에 한해 이용일수 상당액·위약금 공제 후 잔액 환불
//                (월간은 구독 해지만 안내 — subscription-manage)
//
// body: { dryRun?: boolean }  (서버가 최신 결제 원장으로 판정)
//   dryRun=true : 자격 판정과 환불액 산정만 하고 부수효과 없이 결과만 반환한다.
//                 실제 실행과 완전히 같은 코드 경로를 지나므로 미리보기 금액과
//                 실제 환불액이 어긋날 수 없다. 프론트의 버튼 노출 여부와 예상
//                 환불액 표시는 모두 이 응답에만 의존한다(클라이언트 재계산 금지).
// auth: Authorization: Bearer <user jwt> 필수
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, getUser } from "../_shared/admin.ts";
import {
  cancelPayment,
  proratedRefund,
  PRORATED_REFUND_CYCLES,
  type BillingCycle,
} from "../_shared/toss.ts";
import { sendUserEmail, tplRefunded } from "../_shared/email.ts";

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = adminClient();
    const user = await getUser(req, supabase);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { dryRun } = await req.json().catch(() => ({ dryRun: false }));
    // dryRun 은 자격 미충족을 오류가 아니라 판정 결과로 돌려준다(프론트가 사유를 그려야 함).
    const ineligible = (reason: string) =>
      dryRun ? json({ dryRun: true, eligible: false, reason }) : json({ error: reason }, 400);

    // 1. 최신 완료 결제 조회
    const { data: history } = await supabase
      .from("billing_history")
      .select("*")
      .eq("user_id", user.id)
      .eq("kind", "payment")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1);

    const latest = history?.[0];
    if (!latest) return ineligible("환불 대상 결제 내역이 없습니다.");

    // 2. 청약철회 요건 판정 — 7일 이내 + 미사용(결제 시점 이후 모니터링 기록 0)
    const withinWindow = Date.now() - new Date(latest.created_at).getTime() <= SEVEN_DAYS;
    const [{ count: eventCount }, { count: scoreCount }] = await Promise.all([
      supabase.from("posture_events").select("*", { count: "exact", head: true })
        .eq("user_id", user.id).gte("created_at", latest.created_at),
      supabase.from("daily_scores").select("*", { count: "exact", head: true })
        .eq("user_id", user.id).gte("created_at", latest.created_at),
    ]);
    const unused = (eventCount ?? 0) === 0 && (scoreCount ?? 0) === 0;

    // 3. 환불액 산정
    //    (a) 청약철회 요건 충족       → 전액 환불
    //    (b) 일할 환불 대상 주기(연간) → 이용일수 상당액·위약금 공제 후 잔액 환불
    //    (c) 그 외(월간)              → 구독 해지 안내
    const paidAmount = Number(latest.amount);
    const cycle = latest.billing_cycle as BillingCycle | null;
    let refundAmount: number;
    let cancelReason: string;
    let mode: "withdrawal" | "prorated";
    let breakdown = { daysUsed: 0, usedAmount: 0, penalty: 0 };

    if (withinWindow && unused) {
      mode = "withdrawal";
      refundAmount = paidAmount;
      cancelReason = "청약철회 — 결제 7일 이내 미사용 전액 환불";
    } else if (cycle && PRORATED_REFUND_CYCLES.includes(cycle)) {
      const b = proratedRefund(paidAmount, latest.created_at);
      if (b.refund <= 0) {
        return ineligible(
          "이용 기간에 해당하는 금액이 결제 금액을 초과하여 환불할 잔액이 없습니다. 구독 해지를 이용하세요.",
        );
      }
      mode = "prorated";
      refundAmount = b.refund;
      breakdown = { daysUsed: b.daysUsed, usedAmount: b.usedAmount, penalty: b.penalty };
      cancelReason = `중도 해지 — 이용 ${b.daysUsed}일 상당액 및 위약금 공제 후 환불`;
    } else {
      return ineligible(
        "환불 가능 기간(7일)이 지났거나 이용 이력이 있습니다. 구독 해지를 이용하시면 이미 결제한 이용 기간 만료까지 정상 이용하실 수 있습니다.",
      );
    }
    const isFullRefund = refundAmount >= paidAmount;

    // 3-1. dryRun — 여기서 반드시 빠져나간다.
    //      아래로는 토스 취소·구독 강등·원장 갱신 등 되돌릴 수 없는 부수효과만 남는다.
    if (dryRun) {
      return json({
        dryRun: true,
        eligible: true,
        mode,
        paidAmount,
        refund: refundAmount,
        isFullRefund,
        ...breakdown,
      });
    }

    // 4. 실제 Toss 결제 취소 (전액 또는 부분)
    const cancelResult = await cancelPayment(
      latest.payment_key,
      cancelReason,
      refundAmount,
    );

    // 5. 구독 FREE 강등 (service_role → 트리거 통과)
    await supabase.from("user_subscriptions").update({
      plan_id: "free",
      status: "none",
      billing_key: null,
      customer_key: null,
      current_period_end: null,
      grace_period_until: null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    // 6. 원장 환불 처리 (전액=refunded / 부분=partially_refunded)
    await supabase.from("billing_history").update({
      status: isFullRefund ? "refunded" : "partially_refunded",
      refunded_amount: refundAmount,
      refunded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", latest.id);

    // 환불 완료 안내 메일 (§11 H2) — 발송 실패해도 환불 결과엔 영향 없음
    const m = tplRefunded(refundAmount, isFullRefund);
    await sendUserEmail(user.email, m.subject, m.html);

    return json({ success: true, refundedAmount: cancelResult.cancels?.[0]?.cancelAmount ?? refundAmount });
  } catch (e: any) {
    console.error("payment-cancel error:", e?.message ?? e);
    return json({ error: e?.message ?? String(e) }, 400);
  }
});
