import { describe, it, expect, beforeEach } from "vitest";
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

describe("BreakTracker 부재 유예 버퍼", () => {
  it("30초 미만 미검출은 복귀 시 착석으로 소급 인정", () => {
    const t = new BreakTracker();
    const start = 1000;
    t.push(start, true, false, false, false, cfg);
    const { now } = advance(t, start, 600, { present: true }, 10); // 10분 착석
    const seatedBefore = t.snapshot().secsSeated;
    // 20초 미검출(검출 노이즈) — 보류 중에는 착석에 미배정
    const { now: n2 } = advance(t, now, 20, { present: false }, 5);
    expect(t.snapshot().secsSeated).toBe(seatedBefore);
    // 복귀 → 보류 20초 + 복귀 프레임 5초가 착석으로 소급
    const r = t.push(n2 + 5000, true, false, false, false, cfg);
    expect(r.status.secsSeated).toBeCloseTo(seatedBefore + 25, 5);
  });

  it("30초 넘는 미검출은 진짜 부재 — 착석 소급 없음", () => {
    const t = new BreakTracker();
    const start = 1000;
    t.push(start, true, false, false, false, cfg);
    const { now } = advance(t, start, 600, { present: true }, 10);
    const seatedBefore = t.snapshot().secsSeated;
    const { now: n2 } = advance(t, now, 60, { present: false }, 5); // 60초 부재
    const r = t.push(n2 + 5000, true, false, false, false, cfg); // 복귀
    expect(r.status.secsSeated).toBeCloseTo(seatedBefore + 5, 5); // 복귀 프레임만
  });

  it("부재 5분 누적 시 시계 리셋 (기존 동작 유지)", () => {
    const t = new BreakTracker();
    const start = 1000;
    t.push(start, true, false, false, false, cfg);
    const { now } = advance(t, start, 600, { present: true }, 10);
    const { res } = advance(t, now, 5 * 60 + 20, { present: false }, 10);
    expect(res.status.secsSeated).toBe(0);
  });

  it("알림 후 노이즈 미검출(각 30초 미만)은 움직임 목표를 오염시키지 않음", () => {
    const t = new BreakTracker();
    let now = seatUntilMicro(t);
    // 10초 미검출 ↔ 20초 착석 반복 8회 — '가짜 부재' 누적 80초.
    // (수정 전에는 60초를 넘겨 조용히 완료+시계 리셋되던 케이스)
    for (let i = 0; i < 8; i++) {
      ({ now } = advance(t, now, 10, { present: false }, 5));
      const r = advance(t, now, 20, { present: true }, 5);
      now = r.now;
      expect(r.res.completed).toBeNull();
    }
    const snap = t.snapshot();
    expect(snap.stage).toBe("micro");
    expect(snap.movementSecs).toBe(0);
    // 노이즈 구간도 착석으로 소급되어 시계는 끊김 없이 증가
    expect(snap.secsSeated).toBeGreaterThanOrEqual(31 * 60 + 8 * 30 - 1);
  });

  it("진짜 부재는 확정 시 보류분이 목표에 소급 기여 — 60초 부재로 완료", () => {
    const t = new BreakTracker();
    const now = seatUntilMicro(t);
    const { res } = advance(t, now, 60, { present: false }, 10);
    expect(res.completed).toBe("micro");
    expect(res.status.secsSeated).toBe(0);
  });
});

describe("BreakTracker 영속화", () => {
  beforeEach(() => {
    localStorage.removeItem("break_tracker_state_v1");
  });

  it("persist 트래커의 상태를 새 인스턴스가 이어받는다 (reload 생존)", () => {
    const start = Date.now();
    const a = new BreakTracker({ persist: true });
    a.push(start, true, false, false, false, cfg);
    advance(a, start, 120, { present: true }, 10); // 2분 착석 — 주기 저장됨
    const seated = a.snapshot().secsSeated;
    expect(seated).toBeGreaterThanOrEqual(120);

    const b = new BreakTracker({ persist: true }); // reload 후 새 트래커
    expect(b.snapshot().secsSeated).toBeCloseTo(seated, 5);
  });

  it("5분 넘은 스냅샷은 이어받지 않고 0에서 시작", () => {
    localStorage.setItem(
      "break_tracker_state_v1",
      JSON.stringify({
        v: 1,
        savedAt: Date.now() - 6 * 60 * 1000,
        secsSeated: 999,
        secsAbsent: 0,
        absenceConfirmed: false,
        secsResting: 0,
        secsStanding: 0,
        stage: "none",
        stageFiredAt: null,
        movementSecs: 0,
        diag: {
          secsSeated: 999,
          secsAbsent: 0,
          secsResting: 0,
          secsStanding: 0,
          secsReclaimed: 0,
          secsDroppedGap: 0,
        },
      }),
    );
    const t = new BreakTracker({ persist: true });
    expect(t.snapshot().secsSeated).toBe(0);
  });

  it("reset 은 즉시 저장 — 새 인스턴스가 리셋 전 상태를 되살리지 않음", () => {
    const start = Date.now();
    const a = new BreakTracker({ persist: true });
    a.push(start, true, false, false, false, cfg);
    advance(a, start, 60, { present: true }, 10);
    a.reset();
    const b = new BreakTracker({ persist: true });
    expect(b.snapshot().secsSeated).toBe(0);
  });

  it("휴면 후 재개 시 다른 창의 신선한 스냅샷을 이어받는다 (창 핸드오버)", () => {
    const start = Date.now();
    const widget = new BreakTracker({ persist: true });
    widget.push(start, true, false, false, false, cfg);
    const main = new BreakTracker({ persist: true });
    main.push(start, true, false, false, false, cfg);
    const { now } = advance(main, start, 120, { present: true }, 10); // 메인이 2분 계측
    // 위젯 엔진이 2분 휴면 후 재개(dt>30) — 메인의 시계를 이어받아야 함
    const r = widget.push(now + 1000, true, false, false, false, cfg);
    expect(r.status.secsSeated).toBeGreaterThanOrEqual(120);
  });

  it("persist 없는 기본 트래커는 localStorage 를 건드리지 않음", () => {
    const t = new BreakTracker();
    t.push(Date.now(), true, false, false, false, cfg);
    advance(t, Date.now(), 30, { present: true }, 10);
    expect(localStorage.getItem("break_tracker_state_v1")).toBeNull();
  });
});
