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

// ───────── 중도 환불 산식 (콘텐츠이용자보호지침 준거) ─────────
//
//   잔여대금 = 결제금액 − (이용일수 × 정가 일할단가)
//   환불액   = 잔여대금 − 위약금(잔여대금의 PENALTY_RATE)
//
// 일할단가는 월간 "정가" 기준으로 산정한다. 연간 구독을 중도 해지하면 장기 약정
// 할인은 소급 소멸하고 단기(월간) 요율이 적용되기 때문이다. 값을 상수로 박지 않고
// PRICE 에서 유도하므로 요금 개편 시 자동으로 따라간다.
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30;
const PENALTY_RATE = 0.1;

// 일할 중도 환불을 제공하는 결제 주기.
// 월간은 7일·미사용 전액환불만 제공한다(공정위 OTT 약관 시정 기준과 동일).
export const PRORATED_REFUND_CYCLES: readonly BillingCycle[] = ["yearly"];

export interface RefundBreakdown {
  daysUsed: number;
  usedAmount: number;   // 이용일수 상당액 (정가 일할)
  penalty: number;      // 위약금
  refund: number;       // 실제 환불액 (원 단위 절사)
}

export function proratedRefund(
  paidAmount: number,
  paidAt: string | Date,
  now: Date = new Date(),
): RefundBreakdown {
  const dailyListPrice = PRICE.monthly / DAYS_PER_MONTH;
  const elapsed = now.getTime() - new Date(paidAt).getTime();
  // 이용 당일도 1일로 계산한다.
  const daysUsed = Math.max(1, Math.ceil(elapsed / DAY_MS));
  const usedAmount = daysUsed * dailyListPrice;
  const remaining = paidAmount - usedAmount;

  if (remaining <= 0) {
    return { daysUsed, usedAmount: paidAmount, penalty: 0, refund: 0 };
  }
  // 위약금은 "잔여대금의 10% 이내"이므로 올림하지 않는다(내림해야 상한을 넘지 않음).
  const penalty = Math.floor(remaining * PENALTY_RATE);
  return {
    daysUsed,
    usedAmount: Math.round(usedAmount),
    penalty,
    refund: Math.floor(remaining - penalty),
  };
}
