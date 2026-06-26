import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadEvents,
  appendEvent,
  clearEvents,
  __resetDataWarnings,
  DATA_WARNING_EVENT,
  type DataWarningDetail,
} from "./eventLog";

const KEY = "posture_events";
const BACKUP_KEY = "posture_events_corrupt_backup";

function captureWarnings(): DataWarningDetail[] {
  const got: DataWarningDetail[] = [];
  window.addEventListener(DATA_WARNING_EVENT, (e) => {
    got.push((e as CustomEvent<DataWarningDetail>).detail);
  });
  return got;
}

beforeEach(() => {
  localStorage.clear();
  __resetDataWarnings();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadEvents — 정상/빈 상태", () => {
  it("키 없으면 빈 배열", () => {
    expect(loadEvents()).toEqual([]);
  });

  it("정상 JSON 배열을 그대로 반환", () => {
    const ev = [{ id: "1-forward_head", type: "forward_head", startedAt: 1, durationSecs: 5 }];
    localStorage.setItem(KEY, JSON.stringify(ev));
    expect(loadEvents()).toEqual(ev);
  });
});

describe("DATA-1: 손상 데이터 무음 폐기 금지", () => {
  it("손상 JSON이어도 유효 이벤트를 부분 복구하고, 원본을 백업하고, 경고를 발생시킨다", () => {
    const warnings = captureWarnings();
    // 끝이 잘려 JSON.parse 가 실패하는 손상 문자열 (앞 2건은 유효 객체)
    const corrupt =
      '[{"id":"1-forward_head","type":"forward_head","startedAt":1,"durationSecs":5},' +
      '{"id":"2-slouching","type":"slouching","startedAt":2,"durationSecs":9},{"id":"3-bad';
    localStorage.setItem(KEY, corrupt);

    const recovered = loadEvents();

    expect(recovered).toHaveLength(2);
    expect(recovered[0].type).toBe("forward_head");
    expect(recovered[1].type).toBe("slouching");
    // 원본 손상 데이터가 백업됨
    expect(localStorage.getItem(BACKUP_KEY)).toBe(corrupt);
    // 사용자/관측 경고 발생
    expect(warnings.some((w) => w.kind === "corrupt")).toBe(true);
  });

  it("객체이지만 배열이 아니면 손상으로 간주", () => {
    const warnings = captureWarnings();
    localStorage.setItem(KEY, JSON.stringify({ not: "an array" }));
    expect(loadEvents()).toEqual([]);
    expect(warnings.some((w) => w.kind === "corrupt")).toBe(true);
  });

  it("append 가 손상 원본을 1건짜리로 덮어쓰지 않는다(복구분 보존)", () => {
    const corrupt =
      '[{"id":"1-forward_head","type":"forward_head","startedAt":1,"durationSecs":5},{"bad';
    localStorage.setItem(KEY, corrupt);

    appendEvent({ type: "slouching", startedAt: 99, durationSecs: 3 });

    const after = loadEvents();
    // 복구된 1건 + 새 1건 = 2건 (예전 코드라면 새 1건만 남았을 것)
    expect(after).toHaveLength(2);
    expect(after.map((e) => e.startedAt).sort()).toEqual([1, 99]);
  });
});

describe("DATA-1: 용량 초과 시 쓰기 보전", () => {
  it("setItem 이 처음 실패하면 절반만 남기고 재시도하며 quota 경고를 낸다", () => {
    // 기존 데이터 시드
    const seed = Array.from({ length: 10 }, (_, i) => ({
      id: `${i}-slouching`, type: "slouching", startedAt: i, durationSecs: 1,
    }));
    localStorage.setItem(KEY, JSON.stringify(seed));
    const warnings = captureWarnings();

    // 첫 setItem(전체)은 throw, 이후(절반) 호출은 통과하도록 mock
    const real = Storage.prototype.setItem;
    let call = 0;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage, k: string, v: string,
    ) {
      if (k === KEY) {
        call += 1;
        if (call === 1) throw new DOMException("quota", "QuotaExceededError");
      }
      return real.call(this, k, v);
    });

    const ev = appendEvent({ type: "forward_head", startedAt: 100, durationSecs: 2 });
    expect(ev.startedAt).toBe(100);

    // 재시도로 일부만 저장되었고 quota 경고 발생
    expect(warnings.some((w) => w.kind === "quota")).toBe(true);
    spy.mockRestore();
    const after = loadEvents();
    expect(after.length).toBeLessThan(11); // 절반으로 줄어듦
    expect(after.length).toBeGreaterThan(0); // 쓰기는 성공
  });
});

describe("clearEvents", () => {
  it("기록을 비운다", () => {
    appendEvent({ type: "forward_head", startedAt: 1, durationSecs: 1 });
    expect(loadEvents()).toHaveLength(1);
    clearEvents();
    expect(loadEvents()).toEqual([]);
  });
});
