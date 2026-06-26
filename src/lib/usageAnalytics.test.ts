import { describe, it, expect, beforeEach } from "vitest";
import {
  getInstallId,
  isUsageAnalyticsEnabled,
  setUsageAnalyticsEnabled,
  shouldFire,
  __resetUsageDedup,
} from "./usageAnalytics";

beforeEach(() => {
  localStorage.clear();
  __resetUsageDedup();
});

describe("usageAnalytics 동의", () => {
  it("기본 ON, 끄면 OFF", () => {
    expect(isUsageAnalyticsEnabled()).toBe(true);
    setUsageAnalyticsEnabled(false);
    expect(isUsageAnalyticsEnabled()).toBe(false);
    setUsageAnalyticsEnabled(true);
    expect(isUsageAnalyticsEnabled()).toBe(true);
  });
});

describe("getInstallId", () => {
  it("최초 생성 후 안정적으로 유지", () => {
    const a = getInstallId();
    const b = getInstallId();
    expect(a).toBeTruthy();
    expect(a).toBe(b);
    expect(localStorage.getItem("barosit:install_id")).toBe(a);
  });
});

describe("shouldFire dedup", () => {
  it("once: 최초 1회만 true", () => {
    expect(shouldFire("onboarding_completed", "once")).toBe(true);
    expect(shouldFire("onboarding_completed", "once")).toBe(false);
    expect(shouldFire("onboarding_completed", "once")).toBe(false);
  });

  it("daily: 같은 날 1회만 true", () => {
    expect(shouldFire("app_opened", "daily")).toBe(true);
    expect(shouldFire("app_opened", "daily")).toBe(false);
    // 어제 날짜로 마커를 바꾸면 다시 발사 가능
    localStorage.setItem("usage_fired:app_opened", "2000-1-1");
    expect(shouldFire("app_opened", "daily")).toBe(true);
  });

  it("always: 항상 true", () => {
    expect(shouldFire("calibration_succeeded", "always")).toBe(true);
    expect(shouldFire("calibration_succeeded", "always")).toBe(true);
  });

  it("서로 다른 이벤트는 독립적으로 dedup", () => {
    expect(shouldFire("a", "once")).toBe(true);
    expect(shouldFire("b", "once")).toBe(true);
    expect(shouldFire("a", "once")).toBe(false);
  });
});
