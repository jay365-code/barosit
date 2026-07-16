import { describe, it, expect } from "vitest";
import { parseVersion, compareVersions, isBelowMinVersion } from "./semver";

describe("semver", () => {
  it("parseVersion — v 접두사·프리릴리스·빌드메타 제거", () => {
    expect(parseVersion("0.9.10")).toEqual([0, 9, 10]);
    expect(parseVersion("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("0.9.10-beta+build7")).toEqual([0, 9, 10]);
  });

  it("compareVersions — 세그먼트 숫자 비교 (문자열 비교 함정 회피)", () => {
    expect(compareVersions("0.9.9", "0.9.10")).toBe(-1); // 9 < 10 (문자열이면 반대)
    expect(compareVersions("0.9.10", "0.9.9")).toBe(1);
    expect(compareVersions("0.9.9", "0.9.9")).toBe(0);
    expect(compareVersions("1.0.0", "0.9.99")).toBe(1);
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
  });

  it("compareVersions — 세그먼트 수 달라도 0 패딩 비교", () => {
    expect(compareVersions("0.9", "0.9.0")).toBe(0);
    expect(compareVersions("0.9.1", "0.9")).toBe(1);
  });

  it("isBelowMinVersion — 낮으면 true, 같거나 높으면 false", () => {
    expect(isBelowMinVersion("0.9.9", "0.9.10")).toBe(true);
    expect(isBelowMinVersion("0.9.10", "0.9.10")).toBe(false);
    expect(isBelowMinVersion("0.9.11", "0.9.10")).toBe(false);
  });

  it("isBelowMinVersion — fail-open: 빈 값·숫자 없는 값은 절대 차단 안 함", () => {
    expect(isBelowMinVersion("", "0.9.10")).toBe(false);
    expect(isBelowMinVersion("0.9.9", "")).toBe(false);
    expect(isBelowMinVersion("0.9.9", "  ")).toBe(false);
    expect(isBelowMinVersion("0.9.9", "latest")).toBe(false); // 숫자 없는 잘못된 설정
  });
});
