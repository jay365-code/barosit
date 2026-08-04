import { describe, it, expect } from "vitest";
import { pickCompleteDays, localDayKey, dailyUsageProps } from "./dailyUsage";

// MonitorView 의 날짜 전환 로직이 봉인하는 실제 형태
const history = {
  "2026-08-01": { r: 88, v: 6, s: 20, a: 3600, synced: false },
  "2026-08-02": { r: 40, v: 105, s: 55, a: 7200, synced: true },
  "2026-08-03": { r: 0, v: 127, s: 43, a: 5400, synced: false },
};

describe("pickCompleteDays", () => {
  it("완료된 날만 최신순으로 뽑는다", () => {
    expect(pickCompleteDays(history, "2026-08-04")).toEqual([
      { d: "2026-08-03", s: 5400 },
      { d: "2026-08-02", s: 7200 },
      { d: "2026-08-01", s: 3600 },
    ]);
  });

  it("오늘은 제외한다 — 아직 누적 중이라 반쪽 값이다", () => {
    const days = pickCompleteDays(history, "2026-08-03");
    expect(days.map((x) => x.d)).toEqual(["2026-08-02", "2026-08-01"]);
  });

  it("최대 개수를 넘지 않는다", () => {
    const many: Record<string, { a: number }> = {};
    for (let i = 1; i <= 20; i++) {
      many[`2026-07-${String(i).padStart(2, "0")}`] = { a: i * 100 };
    }
    const days = pickCompleteDays(many, "2026-08-01");
    expect(days).toHaveLength(7);
    // 최신순 — 7/20 이 가장 앞
    expect(days[0].d).toBe("2026-07-20");
  });

  it("손상된 항목은 버린다 (NaN·음수·누락)", () => {
    const bad = {
      "2026-08-01": { a: "이상한값" },
      "2026-08-02": { a: -50 },
      "2026-08-03": {},
      "2026-08-04": { a: 1200 },
    };
    expect(pickCompleteDays(bad, "2026-08-05")).toEqual([
      { d: "2026-08-04", s: 1200 },
    ]);
  });

  it("날짜 형식이 아닌 키는 무시한다", () => {
    expect(
      pickCompleteDays({ synced: { a: 1 }, "2026-08-01": { a: 60 } }, "2026-08-02"),
    ).toEqual([{ d: "2026-08-01", s: 60 }]);
  });

  it("히스토리가 없거나 형식이 깨져도 던지지 않는다", () => {
    expect(pickCompleteDays(null, "2026-08-04")).toEqual([]);
    expect(pickCompleteDays("문자열", "2026-08-04")).toEqual([]);
    expect(pickCompleteDays({}, "2026-08-04")).toEqual([]);
  });
});

describe("localDayKey", () => {
  it("로컬 시간대 기준 YYYY-MM-DD — 히스토리 키와 같은 형식", () => {
    expect(localDayKey(new Date(2026, 7, 4, 23, 59))).toBe("2026-08-04");
    expect(localDayKey(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });
});

describe("dailyUsageProps", () => {
  it("기록이 없으면 빈 객체 — 빈 배열을 보내지 않는다", () => {
    localStorage.removeItem("barosit_daily_history");
    expect(dailyUsageProps()).toEqual({});
  });

  it("기록이 있으면 usage_days 로 싣는다", () => {
    localStorage.setItem("barosit_daily_history", JSON.stringify(history));
    const props = dailyUsageProps(new Date(2026, 7, 4)) as {
      usage_days?: { d: string; s: number }[];
    };
    expect(props.usage_days).toHaveLength(3);
    expect(props.usage_days?.[0]).toEqual({ d: "2026-08-03", s: 5400 });
    localStorage.removeItem("barosit_daily_history");
  });

  it("깨진 JSON 이어도 던지지 않는다 — 계측이 앱 실행을 막으면 안 된다", () => {
    localStorage.setItem("barosit_daily_history", "{깨진 json");
    expect(() => dailyUsageProps()).not.toThrow();
    expect(dailyUsageProps()).toEqual({});
    localStorage.removeItem("barosit_daily_history");
  });
});
