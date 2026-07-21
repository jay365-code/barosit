import { describe, it, expect, vi, beforeEach } from "vitest";

// 설정 가능한 supabase 스텁 — refreshTesterStatus 가 읽는 session/profile 을 테스트별로 주입.
// (resolveEffectivePlan 자체는 supabase 를 호출하지 않는다.)
const h = vi.hoisted(() => ({
  state: { session: null as any, profile: null as any },
}));

vi.mock("./auth/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: h.state.session } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: h.state.profile, error: null }),
        }),
      }),
    }),
  },
}));

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

  it("pro + active + 기간 남음 → pro", async () => {
    expect(await resolve({ plan_id: "pro", status: "active", current_period_end: future })).toBe("pro");
  });

  // 정기청구 배치가 멈추면 만료 구독이 active 로 남는다. status 만 믿으면 무기한 PRO 가 된다.
  it("pro + active + 기간 만료 → free", async () => {
    expect(await resolve({ plan_id: "pro", status: "active", current_period_end: past })).toBe("free");
  });

  it("pro + active + 기간 정보 없음 → free (보수적)", async () => {
    expect(await resolve({ plan_id: "pro", status: "active" })).toBe("free");
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

  it("pro_yearly (startsWith pro) + active + 기간 남음 → pro", async () => {
    expect(await resolve({ plan_id: "pro_yearly", status: "active", current_period_end: future })).toBe("pro");
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

describe("staged 모드 (per-user 테스터)", () => {
  beforeEach(() => {
    vi.resetModules();
    try { localStorage.clear(); } catch { /* noop */ }
    localStorage.setItem("barosit:launch_mode", "staged");
    h.state.session = null;
    h.state.profile = null;
  });

  it("테스터 미해결(기본) → 일반 사용자처럼 beta_free(전원 pro·결제 숨김)", async () => {
    const { resolveEffectivePlan, isBetaFree, getEffectiveLaunchMode, getLaunchMode } = await import("./launchMode");
    expect(getLaunchMode()).toBe("staged");           // 원시 모드는 staged
    expect(getEffectiveLaunchMode()).toBe("beta_free"); // 비테스터 실효 모드
    expect(isBetaFree()).toBe(true);
    expect(resolveEffectivePlan({ plan_id: "free", status: "active" })).toBe("pro");
  });

  it("테스터로 해결되면 → paid 게이팅(구독 없으면 free, 구독 있으면 pro)", async () => {
    h.state.session = { user: { id: "u1" } };
    h.state.profile = { is_admin: false, is_beta_tester: true };
    const mod = await import("./launchMode");
    await mod.refreshTesterStatus();
    expect(mod.isTester()).toBe(true);
    expect(mod.isBetaFree()).toBe(false);
    expect(mod.getEffectiveLaunchMode()).toBe("paid");
    expect(mod.resolveEffectivePlan({ plan_id: "free", status: "active" })).toBe("free");
    expect(
      mod.resolveEffectivePlan({
        plan_id: "pro",
        status: "active",
        current_period_end: new Date(Date.now() + 86400000).toISOString(),
      }),
    ).toBe("pro");
  });

  it("어드민도 테스터로 간주", async () => {
    h.state.session = { user: { id: "admin1" } };
    h.state.profile = { is_admin: true, is_beta_tester: false };
    const mod = await import("./launchMode");
    await mod.refreshTesterStatus();
    expect(mod.isTester()).toBe(true);
    expect(mod.getEffectiveLaunchMode()).toBe("paid");
  });

  it("비로그인 → 비테스터(beta_free 취급)", async () => {
    h.state.session = null;
    const mod = await import("./launchMode");
    await mod.refreshTesterStatus();
    expect(mod.isTester()).toBe(false);
    expect(mod.getEffectiveLaunchMode()).toBe("beta_free");
  });

  it("미리보기 토글: 테스터여도 켜면 일반 사용자(beta_free)로 보임, 끄면 복귀", async () => {
    h.state.session = { user: { id: "admin1" } };
    h.state.profile = { is_admin: true, is_beta_tester: false };
    const mod = await import("./launchMode");
    await mod.refreshTesterStatus();
    // 기본: 테스터 → paid
    expect(mod.getEffectiveLaunchMode()).toBe("paid");

    mod.setPreviewAsUser(true);
    expect(mod.isPreviewAsUser()).toBe(true);
    expect(mod.isRealTester()).toBe(true);       // 실제 권한은 유지
    expect(mod.isTester()).toBe(false);           // 실효 테스터는 false
    expect(mod.isBetaFree()).toBe(true);
    expect(mod.getEffectiveLaunchMode()).toBe("beta_free");
    expect(mod.resolveEffectivePlan({ plan_id: "free", status: "active" })).toBe("pro");

    mod.setPreviewAsUser(false);
    expect(mod.isTester()).toBe(true);
    expect(mod.getEffectiveLaunchMode()).toBe("paid");
  });
});

// 부팅 판정 게이트 — 심사자가 #/pricing 에서 튕기던 경합의 회귀 방지.
// 원격 런치모드·테스터 여부를 읽기 전의 isBetaFree() 는 잠정값이므로, 그 값으로
// 리다이렉트하면 staged 의 테스터가 가격 페이지에서 쫓겨난다.
describe("whenLaunchResolved (부팅 판정 게이트)", () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* noop */ }
    vi.resetModules();
    h.state.session = null;
    h.state.profile = null;
  });

  it("두 조회가 모두 끝나기 전에는 확정되지 않는다", async () => {
    const mod = await import("./launchMode");
    expect(mod.isLaunchResolved()).toBe(false);

    await mod.refreshLaunchMode();
    expect(mod.isLaunchResolved()).toBe(false);   // 테스터 판정이 아직

    await mod.refreshTesterStatus();
    expect(mod.isLaunchResolved()).toBe(true);
  });

  it("확정 후 whenLaunchResolved 는 즉시 resolve 된다", async () => {
    const mod = await import("./launchMode");
    await mod.refreshLaunchMode();
    await mod.refreshTesterStatus();

    let settled = false;
    await mod.whenLaunchResolved().then(() => { settled = true; });
    expect(settled).toBe(true);
  });

  it("확정 시점에는 테스터 판정이 이미 반영돼 있다 (튕김 방지의 핵심)", async () => {
    localStorage.setItem("barosit:launch_mode", "staged");
    h.state.session = { user: { id: "reviewer" } };
    h.state.profile = { is_admin: false, is_beta_tester: true };

    const mod = await import("./launchMode");
    // 부팅 직후 잠정값: 테스터 미판정이라 beta_free 로 보인다 = 이때 튕기면 버그
    expect(mod.isBetaFree()).toBe(true);
    expect(mod.isLaunchResolved()).toBe(false);

    await mod.refreshLaunchMode();
    await mod.refreshTesterStatus();
    await mod.whenLaunchResolved();

    expect(mod.isLaunchResolved()).toBe(true);
    expect(mod.isBetaFree()).toBe(false);   // 게이트 통과 후엔 테스터로 확정
  });

  it("비로그인이어도 판정은 완료된다 (early-return 경로)", async () => {
    const mod = await import("./launchMode");
    await mod.refreshLaunchMode();
    await mod.refreshTesterStatus();   // session 없음 → early return
    expect(mod.isLaunchResolved()).toBe(true);
  });
});
