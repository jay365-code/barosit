// POST /functions/v1/admin-refund
// 관리자 강제 환불 (CS/분쟁/오결제 대응). 청약철회(payment-cancel)와 달리
// 7일·미사용 제약 없이, 어드민이 특정 결제를 전액 또는 부분 환불한다(§11 M4-c).
//
// body: { orderId?: string, billingHistoryId?: string, amount?: number, reason?: string, downgrade?: boolean }
//   - orderId 또는 billingHistoryId 중 하나로 대상 결제 지정
//   - amount 미지정 → 전액 환불 / 지정 → 부분 환불
//   - downgrade=true → 해당 사용자를 FREE 로 강등(전액 환불 시 권장)
// auth: Authorization: Bearer <admin user jwt> 필수 (profiles.is_admin = true)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, getUser } from "../_shared/admin.ts";
import { cancelPayment } from "../_shared/toss.ts";
import { sendUserEmail, tplRefunded } from "../_shared/email.ts";
import { logSubEvent } from "../_shared/events.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = adminClient();
    const user = await getUser(req, supabase);
    if (!user) return json({ error: "Unauthorized" }, 401);

    // 어드민 권한 확인 (profiles.is_admin)
    const { data: profile } = await supabase
      .from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    if (!profile?.is_admin) return json({ error: "Forbidden: admin only" }, 403);

    const { orderId, billingHistoryId, amount, reason, downgrade } = await req.json();
    if (!orderId && !billingHistoryId) {
      return json({ error: "orderId 또는 billingHistoryId 가 필요합니다." }, 400);
    }

    // 1. 대상 결제 원장 조회
    let query = supabase.from("billing_history").select("*").eq("kind", "payment").limit(1);
    query = billingHistoryId ? query.eq("id", billingHistoryId) : query.eq("order_id", orderId);
    const { data: rows } = await query;
    const target = rows?.[0];
    if (!target) return json({ error: "환불 대상 결제 내역을 찾을 수 없습니다." }, 404);
    if (!target.payment_key) return json({ error: "paymentKey 가 없어 환불할 수 없습니다." }, 400);
    if (target.status === "refunded") return json({ error: "이미 환불된 결제입니다." }, 400);

    const refundAmount = typeof amount === "number" && amount > 0
      ? Math.min(amount, Number(target.amount))
      : Number(target.amount);
    const isFull = refundAmount >= Number(target.amount);

    // 2. 실제 Toss 결제 취소(부분/전액)
    const cancelResult = await cancelPayment(
      target.payment_key,
      reason || `관리자 강제 환불 (admin: ${user.email ?? user.id})`,
      refundAmount,
    );

    // 3. 원장 갱신 (전액=refunded / 부분=partially_refunded)
    const prevRefunded = Number(target.refunded_amount ?? 0);
    await supabase.from("billing_history").update({
      status: isFull ? "refunded" : "partially_refunded",
      refunded_amount: prevRefunded + refundAmount,
      refunded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", target.id);

    // 4. 선택적 FREE 강등 (전액 환불 + downgrade=true 일 때 권장)
    if (downgrade) {
      await supabase.from("user_subscriptions").update({
        plan_id: "free", status: "none",
        billing_key: null, customer_key: null,
        current_period_end: null, grace_period_until: null,
        updated_at: new Date().toISOString(),
      }).eq("user_id", target.user_id);
    }

    // 5. 환불 완료 안내 메일 (대상 사용자) — 실패해도 환불 결과엔 영향 없음
    try {
      const { data: u } = await supabase.auth.admin.getUserById(target.user_id);
      const m = tplRefunded(refundAmount, isFull);
      await sendUserEmail(u?.user?.email ?? null, m.subject, m.html);
    } catch { /* 무시 */ }

    // 6. 감사 로그
    await supabase.from("admin_notifications").insert({
      event_type: "refund_requested", severity: "info",
      message: `관리자 강제 환불: ${isFull ? "전액" : "부분"} ${refundAmount}원 (대상 user ${target.user_id}, order ${target.order_id}). 집행 admin: ${user.email ?? user.id}.`,
      payload: { admin_id: user.id, user_id: target.user_id, order_id: target.order_id, refund_amount: refundAmount, full: isFull, downgrade: !!downgrade },
    });

    // 대상 사용자 타임라인에도 환불(및 강등)을 남긴다 — actor=admin.
    await logSubEvent(supabase, {
      userId: target.user_id, type: "refunded", actor: "admin",
      detail: { mode: "admin", refund: refundAmount, full: isFull, order_id: target.order_id },
    });
    if (downgrade) {
      await logSubEvent(supabase, {
        userId: target.user_id, type: "downgraded", actor: "admin",
        detail: { reason: "admin_refund" },
      });
    }

    return json({
      success: true,
      refundedAmount: cancelResult.cancels?.[0]?.cancelAmount ?? refundAmount,
      full: isFull,
      downgraded: !!downgrade,
    });
  } catch (e: any) {
    console.error("admin-refund error:", e?.message ?? e);
    return json({ error: e?.message ?? String(e) }, 400);
  }
});
