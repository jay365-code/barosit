import { describe, it, expect } from "vitest";
import { relativeDays, dayKey } from "./AdminDashboardView";

describe("relativeDays", () => {
  const now = new Date(2026, 7, 4, 10, 0); // 2026-08-04 10:00 로컬

  it("같은 날이면 오늘", () => {
    expect(relativeDays(new Date(2026, 7, 4, 1, 0).toISOString(), now)).toEqual({
      label: "오늘",
      days: 0,
    });
  });

  // 경과 시간으로 세면 20분 차이라 "오늘"이 되어 이탈 판정이 하루 밀린다.
  it("어젯밤 23:50 은 자정 직후에도 '어제'", () => {
    const lateLastNight = new Date(2026, 7, 3, 23, 50).toISOString();
    const justAfterMidnight = new Date(2026, 7, 4, 0, 10);
    expect(relativeDays(lateLastNight, justAfterMidnight)).toEqual({
      label: "어제",
      days: 1,
    });
  });

  it("N일 전을 날짜 경계로 센다", () => {
    expect(relativeDays(new Date(2026, 6, 28, 23, 59).toISOString(), now).days).toBe(7);
    expect(relativeDays(new Date(2026, 6, 5, 0, 1).toISOString(), now).days).toBe(30);
  });

  it("월 경계를 넘어도 맞다", () => {
    expect(relativeDays(new Date(2026, 6, 31).toISOString(), now).days).toBe(4);
  });

  it("기록이 없거나 값이 깨졌으면 '기록 없음'", () => {
    expect(relativeDays(null, now)).toEqual({ label: "기록 없음", days: Infinity });
    expect(relativeDays("깨진값", now)).toEqual({ label: "기록 없음", days: Infinity });
  });

  it("미래 시각은 오늘로 묶는다 (기기 시계 어긋남 방어)", () => {
    expect(relativeDays(new Date(2026, 7, 9).toISOString(), now).label).toBe("오늘");
  });
});

describe("dayKey", () => {
  it("점그래프 조회용 키 — 히스토리/RPC 와 같은 YYYY-MM-DD", () => {
    expect(dayKey(new Date(2026, 7, 4))).toBe("2026-08-04");
    expect(dayKey(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});
