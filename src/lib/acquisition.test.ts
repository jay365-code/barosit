import { describe, it, expect, beforeEach } from "vitest";
import { parseAcquisition, getAcquisition, acquisitionProps, __resetAcquisition } from "./acquisition";

const NOW = "2026-07-27T00:00:00.000Z";

describe("parseAcquisition", () => {
  it("utm_source 를 우선 채택하고 medium/campaign 을 함께 담는다", () => {
    const acq = parseAcquisition("?utm_source=Reddit&utm_medium=post&utm_campaign=r_ergonomics", "", NOW);
    expect(acq).toEqual({ source: "reddit", medium: "post", campaign: "r_ergonomics", at: NOW });
  });

  it("utm 이 없으면 외부 리퍼러의 호스트만 기록한다(경로·쿼리 제외)", () => {
    const acq = parseAcquisition("", "https://www.google.com/search?q=%EA%B1%B0%EB%B6%81%EB%AA%A9", NOW);
    expect(acq).toEqual({ source: "ref:google.com", medium: "referral", at: NOW });
  });

  it("자기 도메인·로컬 리퍼러는 유입으로 치지 않는다", () => {
    expect(parseAcquisition("", "https://barosit.com/guide", NOW)).toBeNull();
    expect(parseAcquisition("", "http://localhost:1420/", NOW)).toBeNull();
  });

  it("단서가 없으면 null(직접 유입)", () => {
    expect(parseAcquisition("?redirect_route=pricing", "", NOW)).toBeNull();
  });

  it("utm 값은 소문자화·길이 제한으로 정규화한다", () => {
    const acq = parseAcquisition(`?utm_source=${"A".repeat(60)}`, "", NOW);
    expect(acq?.source).toBe("a".repeat(40));
  });
});

describe("저장/조회", () => {
  beforeEach(() => __resetAcquisition());

  it("저장된 출처가 없으면 props 는 비어 있다", () => {
    expect(getAcquisition()).toBeNull();
    expect(acquisitionProps()).toEqual({});
  });

  it("저장된 출처를 acq_* props 로 평탄화한다", () => {
    localStorage.setItem(
      "barosit:acq",
      JSON.stringify({ source: "youtube", medium: "creator", campaign: "outreach", at: NOW }),
    );
    expect(acquisitionProps()).toEqual({
      acq_source: "youtube",
      acq_medium: "creator",
      acq_campaign: "outreach",
    });
  });

  it("깨진 저장값은 조용히 무시한다", () => {
    localStorage.setItem("barosit:acq", "{not json");
    expect(getAcquisition()).toBeNull();
  });
});
