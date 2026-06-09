// POST /functions/v1/payment-cancel
// 청약철회: 결제 7일 이내 + 미사용(모니터링 기록 0) 시 실제 카드 환불 + FREE 강등
//
// body: {}  (서버가 최신 결제 원장으로 판정)
// auth: Authorization: Bearer <user jwt> 필수
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, getUser } from "../_shared/admin.ts";
import { cancelPayment } from "../_shared/toss.ts";
import { sendUserEmail, tplRefunded } from "../_shared/email.ts";

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = adminClient();
    const user = await getUser(req, supabase);
    if (!user) return json({ error: "Unauthorized" }, 401);

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
    if (!latest) return json({ error: "환불 대상 결제 내역이 없습니다." }, 400);

    // 2. 7일 이내?
    const withinWindow = Date.now() - new Date(latest.created_at).getTime() <= SEVEN_DAYS;
    if (!withinWindow) return json({ error: "환불 가능 기간(7일)이 지났습니다. 구독 해지를 이용하세요." }, 400);

    // 3. 미사용 판정 — 결제 시점 이후 모니터링 기록이 없어야 함
    const [{ count: eventCount }, { count: scoreCount }] = await Promise.all([
      supabase.from("posture_events").select("*", { count: "exact", head: true })
        .eq("user_id", user.id).gte("created_at", latest.created_at),
      supabase.from("daily_scores").select("*", { count: "exact", head: true })
        .eq("user_id", user.id).gte("created_at", latest.created_at),
    ]);
    if ((eventCount ?? 0) > 0 || (scoreCount ?? 0) > 0) {
      return json({ error: "이미 서비스 이용 이력이 있어 청약철회 환불이 불가합니다." }, 400);
    }

    // 4. 실제 Toss 결제 취소
    const cancelResult = await cancelPayment(
      latest.payment_key,
      "고객 변심 및 7일 이내 미사용 전액 환불",
      Number(latest.amount),
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

    // 6. 원장 환불 처리
    await supabase.from("billing_history").update({
      status: "refunded",
      refunded_amount: Number(latest.amount),
      refunded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", latest.id);

    // 환불 완료 안내 메일 (§11 H2) — 발송 실패해도 환불 결과엔 영향 없음
    const refunded = Number(latest.amount);
    const m = tplRefunded(refunded, true);
    await sendUserEmail(user.email, m.subject, m.html);

    return json({ success: true, refundedAmount: cancelResult.cancels?.[0]?.cancelAmount ?? latest.amount });
  } catch (e: any) {
    console.error("payment-cancel error:", e?.message ?? e);
    return json({ error: e?.message ?? String(e) }, 400);
  }
});
