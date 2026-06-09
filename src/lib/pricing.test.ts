import { describe, it, expect } from "vitest";
import { PRICE_KRW, priceFor } from "./pricing";

// 클라이언트 금액 단일 출처(§11 L1). 서버 _shared/toss.ts PRICE 와 값이 일치해야 한다.
describe("priceFor / PRICE_KRW", () => {
  it("월간/연간 금액", () => {
    expect(PRICE_KRW.monthly).toBe(4900);
    expect(PRICE_KRW.yearly).toBe(36000);
  });

  it("cycle 별 금액 산정", () => {
    expect(priceFor("monthly")).toBe(4900);
    expect(priceFor("yearly")).toBe(36000);
  });

  it("미지정/이상값은 월간으로 폴백", () => {
    expect(priceFor(undefined)).toBe(4900);
    expect(priceFor(null)).toBe(4900);
    expect(priceFor("")).toBe(4900);
    expect(priceFor("garbage")).toBe(4900);
  });
});
