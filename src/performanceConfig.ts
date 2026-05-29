// 성능 모드 — 자세 감지 루프의 자원 소모를 사용자가 직접 고를 수 있게 한다.
//
// 자세 위반은 수 초간 지속돼야 의미가 있는 "느린 신호"라 (analyzer 의 시간 게이트
// 참고), 매 프레임 4개 모델을 전부 돌릴 필요가 없다. Eco 는 fps 를 낮추고 무거운
// face/hand 모델을 strided 로 (직전 결과 캐시 재사용) 돌려 CPU·메모리를 크게 줄인다.
//
// - full : 현재 동작 그대로. 기본값이라 기존 사용자 무회귀.
// - eco  : 저성능 장비용. 감지 품질은 거의 유지하면서 점유율을 ~1/3 로.

export type PerformanceProfile = "full" | "eco";

export interface LoopParams {
  /** 초당 감지 틱 수. */
  fps: number;
  /** ImageSegmenter 를 N틱마다 실행. 0이면 끔. */
  segmentEveryN: number;
  /** Face Landmarker 를 N틱마다 실행. 스킵된 틱은 직전 결과 캐시 재사용. */
  faceEveryN: number;
  /** Hand Landmarker 를 N틱마다 실행. 스킵된 틱은 직전 결과 캐시 재사용. */
  handsEveryN: number;
}

// visible: 창이 화면에 보이는지. 가려졌을 땐 segmentation(실루엣)이 안 보이니
// 끄고 fps 도 낮춘다 — 이건 프로필과 무관한 기존 정책.
function fullParams(visible: boolean): LoopParams {
  return {
    fps: visible ? 15 : 10,
    segmentEveryN: visible ? 3 : 0,
    faceEveryN: 1,
    handsEveryN: 1,
  };
}

function ecoParams(visible: boolean): LoopParams {
  return {
    // 자세는 느린 신호라 6fps 로도 지속형 위반 감지에 충분.
    fps: visible ? 6 : 5,
    // segmentation 은 끄면 실루엣+랜드마크 오버레이가 통째로 안 그려지므로
    // (SilhouetteOverlay 참고) 완전히 끄지 않고 저빈도로만 유지.
    segmentEveryN: visible ? 4 : 0,
    faceEveryN: 2,
    handsEveryN: 4,
  };
}

export function getLoopParams(
  profile: PerformanceProfile,
  visible: boolean,
): LoopParams {
  return profile === "eco" ? ecoParams(visible) : fullParams(visible);
}

const STORAGE_KEY = "performance_profile";
export const PERFORMANCE_PROFILE_CHANGED_EVENT = "barosit:performance-profile-change";

export function loadPerformanceProfile(): PerformanceProfile {
  return localStorage.getItem(STORAGE_KEY) === "eco" ? "eco" : "full";
}

export function setPerformanceProfile(profile: PerformanceProfile): void {
  localStorage.setItem(STORAGE_KEY, profile);
  window.dispatchEvent(
    new CustomEvent<PerformanceProfile>(PERFORMANCE_PROFILE_CHANGED_EVENT, {
      detail: profile,
    }),
  );
}

export function subscribePerformanceProfile(
  cb: (profile: PerformanceProfile) => void,
): () => void {
  const handler = (e: Event) =>
    cb((e as CustomEvent<PerformanceProfile>).detail);
  window.addEventListener(PERFORMANCE_PROFILE_CHANGED_EVENT, handler);
  return () =>
    window.removeEventListener(PERFORMANCE_PROFILE_CHANGED_EVENT, handler);
}
