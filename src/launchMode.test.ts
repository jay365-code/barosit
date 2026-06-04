import { describe, it, expect, vi, beforeEach } from "vitest";

// supabase 모듈 import 체인(i18n 등) 회피 — resolveEffectivePlan 은 supabase 를 호출하지 않음
vi.mock("./auth/supabase", () => ({ supabase: {} }));

const future = new Date(Date.now() + 30 * 864e5).toISOString();
const past = new Date(Date.now() - 1 * 864e5).toISOString();

describe("resolveEffectivePlan (paid 모드 — 기본)", () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* noop */ }
    vi.resetModules();
  });

  async function resolve(row: any) {
    const { resolveEffectivePlan } = await import("./launchMode");
    return resolveEffectivePlan(row);
  }

  it("null/undefined → free", async () => {
    expect(await resolve(null)).toBe("free");
    expect(await resolve(undefined)).toBe("free");
  });

  it("plan_id 없음 / free → free", async () => {
    expect(await resolve({ status: "active" })).toBe("free");
    expect(await resolve({ plan_id: "free", status: "active" })).toBe("free");
  });

  it("pro + active → pro", async () => {
    expect(await resolve({ plan_id: "pro", status: "active" })).toBe("pro");
  });

  it("pro + grace_period → pro (유예 중 혜택 유지)", async () => {
    expect(await resolve({ plan_id: "pro", status: "grace_period" })).toBe("pro");
  });

  it("pro + canceled + 기간 남음 → pro", async () => {
    expect(await resolve({ plan_id: "pro", status: "canceled", current_period_end: future })).toBe("pro");
  });

  it("pro + canceled + 기간 만료 → free", async () => {
    expect(await resolve({ plan_id: "pro", status: "canceled", current_period_end: past })).toBe("free");
  });

  it("pro + canceled + 기간 정보 없음 → free (보수적)", async () => {
    expect(await resolve({ plan_id: "pro", status: "canceled" })).toBe("free");
  });

  it("pro + none → free", async () => {
    expect(await resolve({ plan_id: "pro", status: "none" })).toBe("free");
  });

  it("pro_yearly (startsWith pro) + active → pro", async () => {
    expect(await resolve({ plan_id: "pro_yearly", status: "active" })).toBe("pro");
  });
});

describe("resolveEffectivePlan (beta_free 모드)", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.setItem("barosit:launch_mode", "beta_free");
  });

  it("베타면 row 와 무관하게 전원 pro", async () => {
    const { resolveEffectivePlan, isBetaFree } = await import("./launchMode");
    expect(isBetaFree()).toBe(true);
    expect(resolveEffectivePlan(null)).toBe("pro");
    expect(resolveEffectivePlan({ plan_id: "free", status: "none" })).toBe("pro");
  });
});
