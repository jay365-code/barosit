// 결제 알림 메일 템플릿 단위테스트 (deno test --allow-env).
// 발송(Resend) 자체는 수동 QA지만, 템플릿 내용은 자동으로 검증한다.
import { assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { tplPaymentFailed, tplDowngraded, tplRefunded, tplCanceled } from "./email.ts";

Deno.test("결제실패 템플릿 — 카드 갱신 유도 포함", () => {
  const m = tplPaymentFailed(new Date(Date.now() + 7 * 864e5).toISOString());
  assert(m.subject.includes("정기결제"));
  assert(m.html.includes("결제 수단 갱신"));
  assert(m.html.includes("유예"));
});

Deno.test("FREE 강등 템플릿", () => {
  const m = tplDowngraded();
  assert(m.subject.includes("FREE"));
  assert(m.html.includes("재구독") || m.html.includes("다시 시작"));
});

Deno.test("환불 템플릿 — 금액 표기(전액/부분)", () => {
  const full = tplRefunded(4900, true);
  assert(full.subject.includes("환불"));
  assert(full.html.includes("4,900"));
  assert(full.html.includes("전액"));
  const partial = tplRefunded(2000, false);
  assert(partial.html.includes("2,000"));
  assert(partial.html.includes("부분"));
});

Deno.test("해지 예약 템플릿", () => {
  const m = tplCanceled(new Date(Date.now() + 20 * 864e5).toISOString());
  assert(m.subject.includes("해지"));
  assert(m.html.includes("FREE"));
});
