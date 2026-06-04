// Toss Payments 빌링/결제 API 래퍼 (Secret Key 는 백엔드에서만 사용)
//
// 환경변수 TOSS_SECRET_KEY: 테스트키 test_sk_... / 운영키 live_sk_...
// (클라이언트 키 test_ck_/live_ck_ 와 다름 — 절대 프론트로 내보내지 않는다.)

const TOSS_API = "https://api.tosspayments.com";

function authHeader(): string {
  const secret = Deno.env.get("TOSS_SECRET_KEY");
  if (!secret) throw new Error("TOSS_SECRET_KEY environment variable is not set.");
  // Basic base64(secretKey + ":")
  return "Basic " + btoa(secret + ":");
}

export interface TossCard {
  company?: string;
  number?: string;
  cardType?: string;
  ownerType?: string;
}

// authKey + customerKey → billingKey 발급
export async function issueBillingKey(
  authKey: string,
  customerKey: string,
): Promise<{ billingKey: string; card: TossCard }> {
  const res = await fetch(`${TOSS_API}/v1/billing/authorizations/issue`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ authKey, customerKey }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`빌링키 발급 실패: ${data.code ?? ""} ${data.message ?? JSON.stringify(data)}`);
  }
  return { billingKey: data.billingKey, card: data.card ?? {} };
}

// billingKey 로 실제 정기 결제 청구
export async function chargeBilling(params: {
  billingKey: string;
  customerKey: string;
  amount: number;
  orderId: string;
  orderName: string;
  customerEmail?: string;
}): Promise<any> {
  const { billingKey, customerKey, amount, orderId, orderName, customerEmail } = params;
  const res = await fetch(`${TOSS_API}/v1/billing/${billingKey}`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ customerKey, amount, orderId, orderName, customerEmail }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`결제 청구 실패: ${data.code ?? ""} ${data.message ?? JSON.stringify(data)}`);
  }
  return data; // { paymentKey, orderId, status: 'DONE', ... }
}

// paymentKey 결제 취소(환불)
export async function cancelPayment(
  paymentKey: string,
  cancelReason: string,
  cancelAmount?: number,
): Promise<any> {
  const body: Record<string, unknown> = { cancelReason };
  if (typeof cancelAmount === "number") body.cancelAmount = cancelAmount;
  const res = await fetch(`${TOSS_API}/v1/payments/${paymentKey}/cancel`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`결제 취소 실패: ${data.code ?? ""} ${data.message ?? JSON.stringify(data)}`);
  }
  return data;
}

// 웹훅 S2S 교차검증 — orderId 로 PG 원장 직접 조회
export async function getPaymentByOrderId(orderId: string): Promise<any | null> {
  const res = await fetch(`${TOSS_API}/v1/payments/orders/${orderId}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) return null;
  return await res.json();
}

export const PRICE = { monthly: 4900, yearly: 36000 } as const;
export type BillingCycle = keyof typeof PRICE;
