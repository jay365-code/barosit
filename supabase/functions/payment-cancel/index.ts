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

    // 본문 파싱 실패를 dryRun=false 로 흘리면 미리보기 의도의 요청이 실환불로
    // 실행될 수 있다. 빈 본문만 실행으로 보고, 깨진 본문은 거부한다.
    const rawBody = await req.text();
    let body: { dryRun?: boolean } = {};
    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return json({ error: "요청 본문을 해석할 수 없습니다." }, 400);
      }
    }
    const dryRun = body.dryRun === true;
    // dryRun 은 자격 미충족을 오류가 아니라 판정 결과로 돌려준다(프론트가 사유를 그려야 함).
    const ineligible = (reason: string) =>
      dryRun ? json({ dryRun: true, eligible: false, reason }) : json({ error: reason }, 400);

    // 1. 최신 완료 결제 조회
    const { data: history } = await supabase
      .from("billing_history")
      .select("*")
      .eq("user_id", user.id)
      .eq("kind", "payment")
      // 부분 환불된 건도 후보에 남긴다. completed 만 보면 부분 환불 직후 latest 가
      // 이전 주기 결제로 밀려나 엉뚱한 건이 환불 대상이 된다.
      .in("status", ["completed", "partially_refunded"])
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
    // 이미 환불된 금액(어드민 부분 환불 포함)을 뺀 잔여가 환불 가능 상한이다.
    const alreadyRefunded = Number(latest.refunded_amount ?? 0);
    const refundable = paidAmount - alreadyRefunded;
    if (refundable <= 0) {
      return ineligible("이미 전액 환불된 결제입니다.");
    }
    const cycle = latest.billing_cycle as BillingCycle | null;
    let refundAmount: number;
    let cancelReason: string;
    let mode: "withdrawal" | "prorated";
    let breakdown = { daysUsed: 0, usedAmount: 0, penalty: 0 };

    if (withinWindow && unused) {
      mode = "withdrawal";
      refundAmount = refundable;
      cancelReason = "청약철회 — 결제 7일 이내 미사용 전액 환불";
    } else if (cycle && PRORATED_REFUND_CYCLES.includes(cycle)) {
      const b = proratedRefund(paidAmount, latest.created_at);
      // 산정액이 잔여 환불가능액을 넘지 않도록 상한을 건다.
      const amount = Math.min(b.refund, refundable);
      if (amount <= 0) {
        return ineligible(
          "이용 기간에 해당하는 금액이 결제 금액을 초과하여 환불할 잔액이 없습니다. 구독 해지를 이용하세요.",
        );
      }
      mode = "prorated";
      refundAmount = amount;
      breakdown = { daysUsed: b.daysUsed, usedAmount: b.usedAmount, penalty: b.penalty };
      cancelReason = `중도 해지 — 이용 ${b.daysUsed}일 상당액 및 위약금 공제 후 환불`;
    } else {
      return ineligible(
        "환불 가능 기간(7일)이 지났거나 이용 이력이 있습니다. 구독 해지를 이용하시면 이미 결제한 이용 기간 만료까지 정상 이용하실 수 있습니다.",
      );
    }
    // 누적 환불액 기준으로 전액 여부를 판정한다(admin-refund 와 같은 의미).
    const totalRefunded = alreadyRefunded + refundAmount;
    const isFullRefund = totalRefunded >= paidAmount;

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

    // 4. 원장 선점 (CAS) — Toss 호출보다 먼저 한다.
    //    행 잠금도 멱등키도 없어서, 동시 요청 두 건이 같은 latest 를 읽고 둘 다
    //    cancelPayment 를 호출하면 합계가 결제액 이하인 한 토스가 둘 다 승인해
    //    권리액의 두 배가 나갈 수 있었다. 읽은 시점의 status/refunded_amount 를
    //    조건에 걸어 갱신하고, 0행이면 다른 요청이 이미 선점한 것이므로 중단한다.
    const claimStatus = isFullRefund ? "refunded" : "partially_refunded";
    const { data: claimed } = await supabase.from("billing_history")
      .update({
        status: claimStatus,
        // 누적. admin-refund 와 의미를 통일한다(예전에는 여기서 덮어써서 어드민이
        // 먼저 부분 환불한 금액이 원장에서 사라졌다).
        refunded_amount: totalRefunded,
        refunded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", latest.id)
      .eq("status", latest.status)
      .eq("refunded_amount", alreadyRefunded)
      .select("id");

    if (!claimed || claimed.length === 0) {
      return json({ error: "환불이 이미 처리 중이거나 완료되었습니다." }, 409);
    }

    // 5. 실제 Toss 결제 취소 (전액 또는 부분)
    let cancelResult;
    try {
      cancelResult = await cancelPayment(latest.payment_key, cancelReason, refundAmount);
    } catch (cancelErr: any) {
      // 보상 — 선점만 해놓고 실제 취소가 실패하면 원장을 되돌린다. 되돌리지 않으면
      // 환불되지 않은 결제가 refunded 로 남아 사용자가 재신청할 수 없게 된다.
      // (billing-issue 에는 같은 패턴의 보상이 있었는데 환불 경로엔 없었다.)
      await supabase.from("billing_history").update({
        status: latest.status,
        refunded_amount: alreadyRefunded,
        refunded_at: latest.refunded_at ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", latest.id);
      await supabase.from("admin_notifications").insert({
        event_type: "refund_failed", severity: "warning",
        message: `환불 취소 실패로 원장을 되돌림: user ${user.id}, order ${latest.order_id}. ${cancelErr?.message ?? ""}`,
        payload: { user_id: user.id, order_id: latest.order_id, amount: refundAmount },
      });
      throw cancelErr;
    }

    // 6. 구독 FREE 강등 (service_role → 트리거 통과)
    //    여기서 실패하면 돈은 환불됐는데 PRO 가 유지된다. 환불은 이미 성사됐으므로
    //    되돌리지 않고 수동 개입 티켓을 남긴다.
    const { error: subErr } = await supabase.from("user_subscriptions").update({
      plan_id: "free",
      status: "none",
      billing_key: null,
      customer_key: null,
      current_period_end: null,
      grace_period_until: null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    if (subErr) {
      console.error("payment-cancel: 환불 후 구독 강등 실패", user.id, subErr.message);
      await supabase.from("admin_notifications").insert({
        event_type: "refund_downgrade_failed", severity: "critical",
        message: `환불은 완료됐으나 구독 강등에 실패: user ${user.id}. 수동 확인 필요. ${subErr.message}`,
        payload: { user_id: user.id, order_id: latest.order_id, refunded: refundAmount },
      });
    }

    // 환불 완료 안내 메일 (§11 H2) — 발송 실패해도 환불 결과엔 영향 없음
    const m = tplRefunded(refundAmount, isFullRefund);
    await sendUserEmail(user.email, m.subject, m.html);

    return json({ success: true, refundedAmount: cancelResult.cancels?.[0]?.cancelAmount ?? refundAmount });
  } catch (e: any) {
    console.error("payment-cancel error:", e?.message ?? e);
    return json({ error: e?.message ?? String(e) }, 400);
  }
});
