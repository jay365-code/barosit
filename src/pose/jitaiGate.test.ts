import { describe, it, expect } from "vitest";
import { JitaiGate, DEFAULT_JITAI_CONFIG, type JitaiConfig } from "./jitaiGate";

// Phase 6 JITAI 게이트 — 휴식 알림을 방해 가능 순간까지 보류했다 발사하는지 검증.

const cfg: JitaiConfig = { ...DEFAULT_JITAI_CONFIG, maxHoldSecs: 90 };
const FOCUSED = { interruptible: false };
const MOMENT = { interruptible: true };

describe("JitaiGate", () => {
  it("보류 없으면 항상 null", () => {
    const g = new JitaiGate<string>();
    expect(g.push(0, MOMENT, cfg)).toBeNull();
    expect(g.isPending).toBe(false);
  });

  it("방해 가능 순간이 오면 그때 발사", () => {
    const g = new JitaiGate<string>();
    g.hold("break_micro", 0);
    expect(g.push(5_000, FOCUSED, cfg)).toBeNull(); // 집중 중 — 보류
    expect(g.isPending).toBe(true);
    expect(g.push(8_000, MOMENT, cfg)).toBe("break_micro"); // 고개 돌림 — 발사
    expect(g.isPending).toBe(false);
  });

  it("좋은 순간이 없어도 maxHold 초과하면 발사", () => {
    const g = new JitaiGate<string>();
    g.hold("break_standup", 0);
    expect(g.push(89_000, FOCUSED, cfg)).toBeNull();
    expect(g.push(90_000, FOCUSED, cfg)).toBe("break_standup");
  });

  it("비활성(enabled=false)이면 즉시 발사(고정 스케줄)", () => {
    const g = new JitaiGate<string>();
    g.hold("break_deep", 0);
    expect(g.push(0, FOCUSED, { ...cfg, enabled: false })).toBe("break_deep");
  });

  it("reset 하면 보류 폐기(이미 휴식 취한 경우)", () => {
    const g = new JitaiGate<string>();
    g.hold("break_micro", 0);
    g.reset();
    expect(g.isPending).toBe(false);
    expect(g.push(95_000, MOMENT, cfg)).toBeNull();
  });

  it("발사는 한 번만 — 방출 후 다음 프레임은 null", () => {
    const g = new JitaiGate<string>();
    g.hold("break_micro", 0);
    expect(g.push(1_000, MOMENT, cfg)).toBe("break_micro");
    expect(g.push(2_000, MOMENT, cfg)).toBeNull();
  });

  it("hold 는 최신 payload 로 교체", () => {
    const g = new JitaiGate<string>();
    g.hold("break_micro", 0);
    g.hold("break_standup", 1_000);
    expect(g.push(2_000, MOMENT, cfg)).toBe("break_standup");
  });
});
