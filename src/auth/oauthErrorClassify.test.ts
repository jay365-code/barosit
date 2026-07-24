import { describe, it, expect } from "vitest";
import { isExpiredFlowError, isStaleExchangeError } from "./oauthErrorClassify";

// AuthApiError 형태 흉내 — Error + code 프로퍼티.
function authErr(message: string, code?: string): Error & { code?: string } {
  return Object.assign(new Error(message), { code });
}

describe("isExpiredFlowError", () => {
  it("GoTrue 만료 메시지를 감지한다 (2026-07-24 프로덕션 케이스)", () => {
    expect(
      isExpiredFlowError(authErr("invalid flow state, flow state has expired")),
    ).toBe(true);
  });

  it("error_code=flow_state_expired 를 메시지와 무관하게 감지한다", () => {
    expect(isExpiredFlowError(authErr("whatever", "flow_state_expired"))).toBe(true);
  });

  it("문자열 에러도 처리한다", () => {
    expect(isExpiredFlowError("invalid flow state, flow state has expired")).toBe(true);
  });

  it("만료가 아닌 flow state 에러(not found)는 expired 가 아니다", () => {
    expect(
      isExpiredFlowError(authErr("invalid flow state, no valid flow state found")),
    ).toBe(false);
  });

  it("verifier 에러/일반 에러/nullish 는 expired 가 아니다", () => {
    expect(isExpiredFlowError(authErr("PKCE code verifier not found"))).toBe(false);
    expect(isExpiredFlowError(authErr("network error"))).toBe(false);
    expect(isExpiredFlowError(null)).toBe(false);
    expect(isExpiredFlowError(undefined)).toBe(false);
  });
});

describe("isStaleExchangeError", () => {
  it("PKCE 잔여 callback 패턴들을 감지한다", () => {
    expect(isStaleExchangeError("PKCE code verifier not found in storage")).toBe(true);
    expect(isStaleExchangeError("code challenge does not match")).toBe(true);
    expect(isStaleExchangeError("invalid flow state, no valid flow state found")).toBe(true);
    expect(isStaleExchangeError("invalid_grant")).toBe(true);
  });

  it("만료 메시지도 stale 패턴에 매치된다 — 따라서 호출부는 expired 를 먼저 검사해야 한다", () => {
    expect(isStaleExchangeError("invalid flow state, flow state has expired")).toBe(true);
  });

  it("무관한 에러/빈 값은 stale 이 아니다", () => {
    expect(isStaleExchangeError("network error")).toBe(false);
    expect(isStaleExchangeError(undefined)).toBe(false);
    expect(isStaleExchangeError("")).toBe(false);
  });
});
