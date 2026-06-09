// POST /functions/v1/toss-webhook  (verify_jwt = false — Toss 가 직접 호출)
// 클라이언트 이탈로 successUrl 핸들러가 유실돼도 DB 를 무결하게 동기화하는 안전망.
//
// 무서명 폴백: 페이로드를 그대로 믿지 않고 orderId 로 PG 원장을 직접 조회(S2S)해
// 금액/상태를 교차검증한다. 검증 실패 시 500 을 반환해 Toss 재전송을 유도.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/admin.ts";
import { getPaymentByOrderId } from "../_shared/toss.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // 선택적 공유 시크릿 — TOSS_WEBHOOK_SECRET 가 설정돼 있으면 헤더/쿼리로 검증한다.
    // (Toss 빌링 웹훅은 표준 HMAC 서명이 없어, 운영자가 등록 URL 에 ?secret=... 또는
    //  x-webhook-secret 헤더를 붙여 위조 호출을 1차 차단할 수 있게 한다. 미설정 시 종전 동작.)
    const expectedSecret = Deno.env.get("TOSS_WEBHOOK_SECRET");
    if (expectedSecret) {
      const provided = req.headers.get("x-webhook-secret")
        ?? new URL(req.url).searchParams.get("secret");
      if (provided !== expectedSecret) {
        return json({ error: "invalid webhook secret" }, 401);
      }
    }

    const payload = await req.json();
    const eventType = payload?.eventType ?? payload?.type ?? "UNKNOWN";
    const data = payload?.data ?? payload;
    const orderId = data?.orderId;

    // 결제 상태 변동만 처리 (그 외 이벤트는 200 으로 무시)
    if (!orderId) {
      return json({ message: `no orderId; skipping ${eventType}` }, 200);
    }

    const supabase = adminClient();

    // 우리 원장(billing_history)에 없는 orderId 는 동기화 대상이 아니다.
    // 인증이 없는 엔드포인트라, 임의 orderId 를 던져 Toss 원장 조회(S2S)를
    // 폭주시키는 남용·DoS 를 막기 위해 먼저 보유 여부를 확인하고 없으면 200 으로
    // 무시한다(존재하지도 않는 주문 → Toss API 호출 자체를 회피). §7 C2
    const { data: owned } = await supabase.from("billing_history")
      .select("id").eq("order_id", orderId).limit(1);
    if (!owned || owned.length === 0) {
      return json({ message: "unknown orderId; skipping", orderId }, 200);
    }

    // S2S 교차검증 — PG 원장 직접 조회
    const ledger = await getPaymentByOrderId(orderId);
    if (!ledger) {
      // 검증 불가 → 500 으로 재전송 유도 (결제 누락 방지)
      console.error("webhook: ledger fetch failed for", orderId);
      return json({ error: "ledger verification failed" }, 500);
    }

    // 기존 원장 행을 멱등하게 동기화 (행은 우리 결제 핸들러가 먼저 적재).
    // user_id NOT NULL 이라 신규 insert 는 하지 않고 update 만 — 누락 시 0행.
    const status = ledger.status === "DONE" ? "completed"
      : ledger.status === "CANCELED" ? "refunded"
      : "pending";

    const { data: updated } = await supabase.from("billing_history")
      .update({
        payment_key: ledger.paymentKey ?? null,
        amount: ledger.totalAmount ?? 0,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId)
      .select("id");

    return json({ success: true, orderId, status, synced: (updated?.length ?? 0) > 0 });
  } catch (e: any) {
    console.error("toss-webhook error:", e?.message ?? e);
    // 처리 중 오류 → 재전송 유도
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
