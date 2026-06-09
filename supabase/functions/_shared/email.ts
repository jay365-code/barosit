// 결제 라이프사이클 사용자 알림 이메일 (§11 H2). Resend API 재사용.
//
// RESEND_API_KEY 미설정 시 조용히 건너뛴다 — 알림 실패가 결제/더닝 본 로직을
// 막아서는 안 된다(이메일은 부가 채널). 발송 결과 boolean 반환.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = "BaroSit <support@barosit.com>";

export async function sendUserEmail(to: string | null | undefined, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY 미설정 — 이메일 생략:", subject);
    return false;
  }
  if (!to) {
    console.warn("[email] 수신자 없음 — 생략:", subject);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error("[email] 발송 실패:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] 발송 예외:", e);
    return false;
  }
}

// 공통 레이아웃 래퍼 (send-inquiry-email 스타일과 일관)
function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  const ctaHtml = cta
    ? `<div style="text-align:center;margin:28px 0 8px"><a href="${cta.url}" style="display:inline-block;background:#5b8c7a;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px">${cta.label}</a></div>`
    : "";
  return `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:30px 25px;border:1px solid #e2e8f0;border-radius:14px">
    <div style="text-align:center;padding-bottom:22px;border-bottom:1px solid #f1f5f9;margin-bottom:22px">
      <span style="font-size:22px;font-weight:900;color:#0f172a;letter-spacing:-0.04em">barosit</span>
    </div>
    <h2 style="color:#0f172a;font-weight:700;margin-top:0;font-size:18px;line-height:1.4">${title}</h2>
    <div style="line-height:1.65;color:#334155;font-size:14px">${bodyHtml}</div>
    ${ctaHtml}
    <div style="font-size:11px;color:#94a3b8;margin-top:36px;text-align:center;border-top:1px solid #f1f5f9;padding-top:18px">
      본 메일은 발신전용입니다. 문의는 support@barosit.com 으로 보내주세요.
    </div>
  </div>`;
}

const BILLING_URL = "https://barosit.com/#/pricing";

// 결제 실패 → 유예 시작 안내 (카드 갱신 유도)
export function tplPaymentFailed(graceUntilIso?: string | null): { subject: string; html: string } {
  const until = graceUntilIso ? new Date(graceUntilIso).toLocaleDateString("ko-KR") : "약 7일 후";
  return {
    subject: "[BaroSit] 정기결제가 실패했어요 — 카드 정보를 확인해 주세요",
    html: layout(
      "정기결제에 실패했습니다",
      `<p>등록하신 카드로 PRO 구독 정기결제가 처리되지 않았습니다(한도 초과·유효기간 만료 등).</p>
       <p><strong>${until}까지 유예기간</strong> 동안에는 PRO 기능을 계속 이용하실 수 있습니다.
       기간 내에 결제 수단을 갱신해 주시면 구독이 정상 유지되며, 갱신이 없으면 FREE 등급으로 전환됩니다.</p>`,
      { label: "결제 수단 갱신하기", url: BILLING_URL },
    ),
  };
}

// 유예 만료 → FREE 강등 안내
export function tplDowngraded(): { subject: string; html: string } {
  return {
    subject: "[BaroSit] 구독이 FREE 등급으로 전환되었습니다",
    html: layout(
      "PRO 구독이 종료되었습니다",
      `<p>정기결제 유예기간이 만료되어 구독이 <strong>FREE 등급으로 전환</strong>되었습니다.
       그동안 BaroSit PRO 를 이용해 주셔서 감사합니다.</p>
       <p>다시 PRO 기능(백그라운드 지속 관제, 클라우드 동기화 등)을 이용하시려면 언제든 재구독하실 수 있습니다.</p>`,
      { label: "PRO 다시 시작하기", url: BILLING_URL },
    ),
  };
}

// 환불 완료 안내
export function tplRefunded(amount: number, full: boolean): { subject: string; html: string } {
  return {
    subject: "[BaroSit] 환불이 완료되었습니다",
    html: layout(
      `${full ? "전액" : "부분"} 환불이 완료되었습니다`,
      `<p>요청하신 결제 건에 대해 <strong>${amount.toLocaleString("ko-KR")}원</strong>이 환불 처리되었습니다.
       카드사 정책에 따라 영업일 기준 3~5일 내 카드 명세서에 반영됩니다.</p>
       <p>이용에 불편을 드렸다면 죄송합니다. 다시 찾아주시길 기다리겠습니다.</p>`,
    ),
  };
}

// 구독 해지(예약) 접수 안내
export function tplCanceled(periodEndIso?: string | null): { subject: string; html: string } {
  const end = periodEndIso ? new Date(periodEndIso).toLocaleDateString("ko-KR") : "현재 결제 주기 만료일";
  return {
    subject: "[BaroSit] 구독 해지가 예약되었습니다",
    html: layout(
      "구독 해지가 접수되었습니다",
      `<p>구독 해지가 정상 접수되었습니다. <strong>${end}까지</strong> PRO 기능을 그대로 이용하실 수 있으며,
       만료일에 추가 청구 없이 FREE 등급으로 전환됩니다.</p>
       <p>마음이 바뀌시면 만료 전 언제든 해지를 철회(재개)하실 수 있습니다.</p>`,
      { label: "구독 관리", url: BILLING_URL },
    ),
  };
}
