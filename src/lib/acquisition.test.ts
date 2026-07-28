import { describe, it, expect, beforeEach } from "vitest";
import { parseAcquisition, parseGoPath, getAcquisition, acquisitionProps, __resetAcquisition } from "./acquisition";

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

describe("parseGoPath — 짧은 유입 링크", () => {
  it("/go/<출처>/<캠페인> 을 해석한다", () => {
    expect(parseGoPath("/go/creator/healstory_video", NOW)).toEqual({
      source: "creator",
      medium: "link",
      campaign: "healstory_video",
      at: NOW,
    });
  });

  it("캠페인은 생략할 수 있다", () => {
    expect(parseGoPath("/go/kin", NOW)).toEqual({ source: "kin", medium: "link", campaign: undefined, at: NOW });
  });

  it("끝 슬래시를 허용하고 대문자는 소문자로 정규화한다", () => {
    expect(parseGoPath("/go/Creator/Healstory/", NOW)?.source).toBe("creator");
    expect(parseGoPath("/go/Creator/Healstory/", NOW)?.campaign).toBe("healstory");
  });

  it("형식이 안 맞으면 무시한다(직접 유입 처리)", () => {
    expect(parseGoPath("/go", NOW)).toBeNull();
    expect(parseGoPath("/go/", NOW)).toBeNull();
    expect(parseGoPath("/go/a/b/c", NOW)).toBeNull();
    expect(parseGoPath("/community/p/abc", NOW)).toBeNull();
    expect(parseGoPath("/", NOW)).toBeNull();
  });

  it("허용 문자 밖의 값은 기록하지 않는다", () => {
    expect(parseGoPath("/go/크리에이터", NOW)).toBeNull();
    expect(parseGoPath("/go/creator/hea%20story", NOW)).toBeNull();
    expect(parseGoPath("/go/creator/<script>", NOW)).toBeNull();
  });

  it("경로가 utm 보다 우선한다", () => {
    const acq = parseAcquisition("?utm_source=reddit", "", NOW, "/go/creator/healstory_video");
    expect(acq?.source).toBe("creator");
    expect(acq?.campaign).toBe("healstory_video");
  });

  it("경로가 없으면 기존 utm·리퍼러 판정을 그대로 탄다", () => {
    expect(parseAcquisition("?utm_source=reddit", "", NOW, "/")?.source).toBe("reddit");
    expect(parseAcquisition("", "https://news.ycombinator.com/x", NOW, "/")?.source).toBe("ref:news.ycombinator.com");
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
