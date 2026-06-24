import { describe, it, expect, vi, beforeEach } from "vitest";

// userProfile 은 모듈 로드 시 supabase.auth.onAuthStateChange 를 구독한다 — noop 으로 모킹.
vi.mock("./auth/supabase", () => ({
  supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
}));

const AUTH_KEY = "sb-test-auth-token";
function setSessionUser(id: string | null) {
  if (id === null) localStorage.removeItem(AUTH_KEY);
  else localStorage.setItem(AUTH_KEY, JSON.stringify({ user: { id } }));
}

describe("프로필 캐시 계정 누수 차단 (reconcileProfileCache / loadProfile)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("다른 계정 소유 캐시는 무효화되어 DEFAULT 반환", async () => {
    const { loadProfile, PROFILE_OWNER_KEY } = await import("./userProfile");
    setSessionUser("userA");
    localStorage.setItem("user_profile_v1", JSON.stringify({ name: "다른계정", avatar: "😊", workEnv: "mixed" }));
    localStorage.setItem(PROFILE_OWNER_KEY, "userB"); // 소유자가 다름
    const p = loadProfile();
    expect(p.name).toBe(""); // DEFAULT_PROFILE.name
    expect(localStorage.getItem("user_profile_v1")).toBeNull(); // 폐기됨
  });

  it("소유자 미각인 레거시 캐시도 안전하게 폐기", async () => {
    const { loadProfile } = await import("./userProfile");
    setSessionUser("userA");
    localStorage.setItem("user_profile_v1", JSON.stringify({ name: "레거시", avatar: "😊", workEnv: "mixed" }));
    // PROFILE_OWNER_KEY 없음
    const p = loadProfile();
    expect(p.name).toBe("");
    expect(localStorage.getItem("user_profile_v1")).toBeNull();
  });

  it("같은 계정 캐시는 보존", async () => {
    const { loadProfile, PROFILE_OWNER_KEY } = await import("./userProfile");
    setSessionUser("userA");
    localStorage.setItem("user_profile_v1", JSON.stringify({ name: "본인", avatar: "🌿", workEnv: "laptop" }));
    localStorage.setItem(PROFILE_OWNER_KEY, "userA");
    const p = loadProfile();
    expect(p.name).toBe("본인");
    expect(p.avatar).toBe("🌿");
  });

  it("saveProfile 은 현재 사용자 id 로 소유자를 각인", async () => {
    const { saveProfile, loadProfile, PROFILE_OWNER_KEY, DEFAULT_PROFILE } = await import("./userProfile");
    setSessionUser("userA");
    saveProfile({ ...DEFAULT_PROFILE, name: "새이름" });
    expect(localStorage.getItem(PROFILE_OWNER_KEY)).toBe("userA");
    // 같은 계정에서 다시 로드하면 보존
    expect(loadProfile().name).toBe("새이름");
    // 다른 계정으로 바뀌면 무효화
    setSessionUser("userB");
    expect(loadProfile().name).toBe("");
  });

  it("비로그인 상태에서는 캐시를 건드리지 않음", async () => {
    const { loadProfile } = await import("./userProfile");
    setSessionUser(null);
    localStorage.setItem("user_profile_v1", JSON.stringify({ name: "유지", avatar: "😊", workEnv: "mixed" }));
    const p = loadProfile();
    expect(p.name).toBe("유지");
  });
});
