import { describe, it, expect } from "vitest";
import { BreakTracker, DEFAULT_BREAK_CONFIG } from "./breakTracker";

const cfg = DEFAULT_BREAK_CONFIG; // micro 30분 / goal 60초

interface Frame {
  present?: boolean;
  resting?: boolean;
  standing?: boolean;
  stretch?: boolean;
  moving?: boolean;
}

/** now(ms)에서 secs초 동안 step초 간격으로 프레임을 밀어넣고 마지막 결과를 반환. */
function advance(
  t: BreakTracker,
  from: number,
  secs: number,
  f: Frame,
  step = 30,
) {
  let now = from;
  let res = t.push(now, true, false, false, false, cfg); // dummy init
  const n = Math.round(secs / step);
  for (let i = 0; i < n; i++) {
    now += step * 1000;
    res = t.push(
      now,
      f.present ?? true,
      f.resting ?? false,
      f.standing ?? false,
      f.stretch ?? false,
      cfg,
      f.moving ?? false,
    );
  }
  return { res, now };
}

/** micro 단계가 발사될 때까지 착석. 발사 시점의 now 반환. */
function seatUntilMicro(t: BreakTracker) {
  const start = 1000;
  t.push(start, true, false, false, false, cfg); // prime (dt=0)
  const { now } = advance(t, start, 31 * 60, { present: true }); // 31분 착석
  return now;
}

describe("BreakTracker 움직임 목표(30-1)", () => {
  it("30분 연속 착석 시 micro 단계 발사", () => {
    const t = new BreakTracker();
    const now = seatUntilMicro(t);
    const snap = t.snapshot();
    expect(snap.stage).toBe("micro");
    expect(snap.secsSeated).toBeGreaterThanOrEqual(30 * 60);
    expect(snap.goalSecs).toBe(60);
    expect(now).toBeGreaterThan(0);
  });

  it("순간 스트레치 한 번으로는 리셋도 단계 해제도 안 됨", () => {
    const t = new BreakTracker();
    const now = seatUntilMicro(t);
    const before = t.snapshot().secsSeated;
    // 스트레치 1프레임(1초)
    const r = t.push(now + 1000, true, false, false, true, cfg);
    expect(r.completed).toBeNull();
    expect(r.status.stage).toBe("micro"); // 여전히 알림 유지
    expect(r.status.secsSeated).toBeGreaterThanOrEqual(before); // 착석시계 안 지워짐
    expect(r.status.movementSecs).toBeLessThan(60); // 목표 미달
  });

  it("60초 기립(움직임 목표 달성) → 완료 + 착석시계 리셋", () => {
    const t = new BreakTracker();
    const now = seatUntilMicro(t);
    const { res } = advance(t, now, 60, { standing: true }, 20); // 3×20s 기립
    expect(res.completed).toBe("micro");
    expect(res.status.stage).toBe("none");
    expect(res.status.secsSeated).toBe(0);
  });

  it("40초 움직임(목표 미달)으로는 완료 안 됨", () => {
    const t = new BreakTracker();
    const now = seatUntilMicro(t);
    const { res } = advance(t, now, 40, { standing: true }, 20); // 2×20s
    expect(res.completed).toBeNull();
    expect(res.status.stage).toBe("micro");
    expect(res.status.movementSecs).toBeGreaterThanOrEqual(40);
  });

  it("착석 중 활발한 움직임(movingNow)도 목표에 기여", () => {
    const t = new BreakTracker();
    const now = seatUntilMicro(t);
    // 앉은 채 movingNow=true 60초 → 완료
    const { res } = advance(t, now, 60, { present: true, moving: true }, 20);
    expect(res.completed).toBe("micro");
    expect(res.status.secsSeated).toBe(0);
  });

  it("단계 없을 때는 목표 누적이 0으로 유지", () => {
    const t = new BreakTracker();
    const start = 1000;
    t.push(start, true, false, false, false, cfg);
    // 아직 30분 전 — 움직여도 목표 누적 안 함
    const { res } = advance(t, start, 60, { standing: true }, 20);
    expect(res.status.movementSecs).toBe(0);
    expect(res.completed).toBeNull();
  });
});
