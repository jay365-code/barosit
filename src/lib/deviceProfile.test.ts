import { describe, it, expect } from "vitest";
import { parseOsFamily, deviceProps } from "./deviceProfile";

describe("parseOsFamily", () => {
  it("Windows 데스크톱 — 프로덕션에 실제로 찍힌 Tauri 웹뷰 UA", () => {
    expect(
      parseOsFamily(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      ),
    ).toBe("windows");
  });

  it("macOS", () => {
    expect(
      parseOsFamily(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ),
    ).toBe("macos");
  });

  it("Linux", () => {
    expect(
      parseOsFamily(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      ),
    ).toBe("linux");
  });

  // 순서 함정 — Android UA 에는 "Linux" 가 함께 들어 있다.
  it("Android 는 Linux 로 오분류되지 않는다", () => {
    expect(
      parseOsFamily(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe("android");
  });

  // 순서 함정 — iPhone UA 에는 "like Mac OS X" 가 들어 있다.
  it("iOS 는 macOS 로 오분류되지 않는다", () => {
    expect(
      parseOsFamily(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("ios");
  });

  it("알 수 없는 UA 는 other", () => {
    expect(parseOsFamily("")).toBe("other");
    expect(parseOsFamily("curl/8.4.0")).toBe("other");
  });
});

describe("deviceProps", () => {
  it("os 와 cores 를 담는다", () => {
    const props = deviceProps();
    expect(typeof props.os).toBe("string");
    if (props.cores !== undefined) {
      expect(Number.isInteger(props.cores)).toBe(true);
      expect(props.cores as number).toBeGreaterThan(0);
    }
  });

  it("UA 전문을 싣지 않는다 — OS 계열 한 단어로만 환원", () => {
    const props = deviceProps();
    for (const v of Object.values(props)) {
      expect(String(v)).not.toMatch(/Mozilla|AppleWebKit|Chrome\//);
      expect(String(v).length).toBeLessThan(16);
    }
  });
});
