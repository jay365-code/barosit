import { describe, it, expect } from "vitest";
import {
  ComplianceTracker,
  DEFAULT_COMPLIANCE_CONFIG,
  type ComplianceConfig,
  type ComplianceSignals,
} from "./complianceTracker";

// Phase 5 준수 추적 — 알림 후 응답 윈도우 내 행동으로 준수/미준수를 확정하는지 검증.

const cfg: ComplianceConfig = { ...DEFAULT_COMPLIANCE_CONFIG, responseWindowSecs: 60, historySize: 5 };
const NONE: ComplianceSignals = { tookBreak: false, movedSlightly: false };
const BREAK: ComplianceSignals = { tookBreak: true, movedSlightly: false };
const MOVE: ComplianceSignals = { tookBreak: false, movedSlightly: true };

describe("ComplianceTracker", () => {
  it("휴식을 취하면 준수로 확정한다", () => {
    const t = new ComplianceTracker();
    t.notifyFired("break_micro", 0);
    const { resolved } = t.push(5_000, BREAK, cfg);
    expect(resolved).toEqual({ kind: "break_micro", complied: true, latencySecs: 5 });
    expect(t.status().recentComplianceRate).toBe(1);
    expect(t.status().ignoreStreak).toBe(0);
  });

  it("응답 윈도우가 지나도록 무시하면 미준수로 확정한다", () => {
    const t = new ComplianceTracker();
    t.notifyFired("break_micro", 0);
    expect(t.push(30_000, NONE, cfg).resolved).toBeNull(); // 윈도우 내 — 미확정
    const { resolved } = t.push(61_000, NONE, cfg);
    expect(resolved).toEqual({ kind: "break_micro", complied: false, latencySecs: 61 });
    expect(t.status().ignoreStreak).toBe(1);
    expect(t.status().recentComplianceRate).toBe(0);
  });

  it("변동성 알림은 가벼운 움직임도 준수로 인정한다", () => {
    const t = new ComplianceTracker();
    t.notifyFired("variability", 0);
    expect(t.push(3_000, MOVE, cfg).resolved?.complied).toBe(true);
  });

  it("휴식 알림은 가벼운 움직임만으로는 준수가 아니다", () => {
    const t = new ComplianceTracker();
    t.notifyFired("break_standup", 0);
    expect(t.push(3_000, MOVE, cfg).resolved).toBeNull(); // 아직 대기
    expect(t.push(61_000, MOVE, cfg).resolved?.complied).toBe(false); // 윈도우 후 미준수
  });

  it("연속 무시가 누적되고 준수 시 0으로 리셋된다", () => {
    const t = new ComplianceTracker();
    for (let i = 0; i < 3; i++) {
      t.notifyFired("variability", i * 100_000);
      t.push(i * 100_000 + 61_000, NONE, cfg);
    }
    expect(t.status().ignoreStreak).toBe(3);
    t.notifyFired("variability", 400_000);
    t.push(400_500, MOVE, cfg);
    expect(t.status().ignoreStreak).toBe(0);
  });

  it("이력은 historySize 로 제한된다", () => {
    const t = new ComplianceTracker();
    // 6번 미준수(historySize=5) → 순응률 0, 윈도우 초과 후에도 0..1 범위
    for (let i = 0; i < 6; i++) {
      t.notifyFired("break_micro", i * 100_000);
      t.push(i * 100_000 + 61_000, NONE, cfg);
    }
    expect(t.status().recentComplianceRate).toBe(0);
    // 이후 5번 준수 → 이력이 밀려 순응률 1
    for (let i = 6; i < 11; i++) {
      t.notifyFired("break_micro", i * 100_000);
      t.push(i * 100_000 + 1_000, BREAK, cfg);
    }
    expect(t.status().recentComplianceRate).toBe(1);
  });

  it("가장 최근 알림 기준으로 판정한다(교체)", () => {
    const t = new ComplianceTracker();
    t.notifyFired("break_micro", 0);
    t.notifyFired("break_standup", 1_000); // 교체
    const { resolved } = t.push(2_000, BREAK, cfg);
    expect(resolved?.kind).toBe("break_standup");
  });
});
