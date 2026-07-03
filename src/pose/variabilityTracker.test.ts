import { describe, it, expect, beforeEach } from "vitest";
import {
  VariabilityTracker,
  DEFAULT_VARIABILITY_CONFIG,
  loadVariabilityConfig,
  type VariabilityConfig,
} from "./variabilityTracker";

// 1분 윈도우로 축약 — 판정 로직은 윈도우 길이와 무관.
const cfg: VariabilityConfig = { ...DEFAULT_VARIABILITY_CONFIG, windowMinutes: 1 };

/** step초 간격으로 secs초 동안 메트릭을 밀어넣고 마지막 결과 + 발사 여부 반환.
 *  fired 는 1회성(발사 후 쿨다운)이라 마지막 프레임이 아닌 전체에서 수집한다. */
function feed(
  t: VariabilityTracker,
  from: number,
  secs: number,
  metricsAt: (i: number) => { sy: number; ny: number; nz: number; p: number },
  step = 2,
) {
  let now = from;
  let res = t.push(now, true, false, metricsAt(0), cfg);
  let anyFired = res.fired;
  const n = Math.round(secs / step);
  for (let i = 1; i <= n; i++) {
    now += step * 1000;
    res = t.push(now, true, false, metricsAt(i), cfg);
    anyFired = anyFired ?? res.fired;
  }
  return { res, now, anyFired };
}

// 쿨다운(15분)과 윈도우를 확실히 지난 시작 시각.
const START = 30 * 60 * 1000;

describe("VariabilityTracker 정체 판정 (재조정 스케일)", () => {
  it("완전 정지(메트릭 고정) → index ≈ 0 < 정체 임계 → 발사", () => {
    const t = new VariabilityTracker();
    const still = () => ({ sy: 0.5, ny: 0.3, nz: 0.1, p: 0.05 });
    const { res, anyFired } = feed(t, START, 90, still);
    expect(res.status.windowFilled).toBe(true);
    expect(res.status.movementIndex).toBeLessThan(cfg.threshold);
    expect(anyFired).not.toBeNull();
  });

  it("활발한 움직임 → index ≥ 움직임 임계, 정체 발사 없음", () => {
    const t = new VariabilityTracker();
    // ±0.05 진동 → sy stdev 0.05*100=5, ny 0.05*80=4 → index ≈ 9
    const moving = (i: number) => {
      const d = i % 2 === 0 ? 0.05 : -0.05;
      return { sy: 0.5 + d, ny: 0.3 + d, nz: 0.1, p: 0.05 };
    };
    const { res, anyFired } = feed(t, START, 90, moving);
    expect(res.status.windowFilled).toBe(true);
    expect(anyFired).toBeNull();
    expect(res.status.movementIndex).toBeGreaterThanOrEqual(
      cfg.movementThreshold,
    );
  });

  it("정지여도 부재 1프레임이 끼면 윈도우 리셋 (raw 신호 기준 — 엔진은 디바운스로 보호)", () => {
    const t = new VariabilityTracker();
    const still = () => ({ sy: 0.5, ny: 0.3, nz: 0.1, p: 0.05 });
    const { now } = feed(t, START, 40, still);
    t.push(now + 2000, false, false, still(), cfg); // 부재 1프레임 → 윈도우 무효화
    const { res } = feed(t, now + 4000, 40, still);
    expect(res.status.windowFilled).toBe(false);
    expect(res.fired).toBeNull();
  });
});

describe("loadVariabilityConfig 마이그레이션", () => {
  beforeEach(() => {
    localStorage.removeItem("variability_config");
  });

  it("구 스케일 임계(0.6)는 폐기하고 새 기본값 사용, 다른 설정은 보존", () => {
    localStorage.setItem(
      "variability_config",
      JSON.stringify({ threshold: 0.6, windowMinutes: 5 }),
    );
    const c = loadVariabilityConfig();
    expect(c.threshold).toBe(DEFAULT_VARIABILITY_CONFIG.threshold);
    expect(c.movementThreshold).toBe(
      DEFAULT_VARIABILITY_CONFIG.movementThreshold,
    );
    expect(c.windowMinutes).toBe(5);
  });

  it("새 스케일 임계는 그대로 존중", () => {
    localStorage.setItem(
      "variability_config",
      JSON.stringify({ threshold: 4.0, movementThreshold: 7.0 }),
    );
    const c = loadVariabilityConfig();
    expect(c.threshold).toBe(4.0);
    expect(c.movementThreshold).toBe(7.0);
  });
});
