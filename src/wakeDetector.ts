/**
 * 슬립/노트북 덮개 닫힘/화면보호기/잠금 등으로 JS 실행이 멈췄다가 깨어난 순간을
 * 타이머 드리프트로 감지한다.
 *
 * setInterval 한 틱이 기대(TICK_MS)보다 크게 늦으면 = 그 사이 웹뷰가 통째로 얼었다
 * (시스템이 잤다) 깨어난 것. visibilitychange 는 슬립/덮개 닫힘에서 안 뜨는 경우가
 * 많아(페이지가 hidden 이 아니라 frozen) 이 드리프트 감지가 그 갭을 메운다.
 *
 * 깨어남 = 사용자가 작업을 재개한 신호 → 소비자들이 카메라 재획득 / 자리비움 타이머
 * 리셋으로 모니터링을 깔끔히 재개한다. AudioContext 같은 power assertion 이 아니라
 * 단순 타이머라 배터리 영향 없음(슬립 중엔 타이머도 멈춰 있다).
 */

const TICK_MS = 2000;
// 기대 2s 대비 이만큼 이상 점프하면 슬립에서 깨어난 것으로 간주.
const WAKE_GAP_MS = 10000;
export const WAKE_EVENT = "barosit:wake";

let intervalId: number | null = null;
let lastTick = 0;

export function startWakeDetector(): void {
  if (intervalId != null) return;
  lastTick = Date.now();
  intervalId = window.setInterval(() => {
    const now = Date.now();
    const gap = now - lastTick;
    lastTick = now;
    if (gap > WAKE_GAP_MS) {
      window.dispatchEvent(new CustomEvent<number>(WAKE_EVENT, { detail: gap }));
    }
  }, TICK_MS);
}

/** wake 이벤트 구독. 첫 구독 시 감지기를 자동 시작한다. */
export function subscribeWake(cb: (gapMs: number) => void): () => void {
  startWakeDetector();
  const handler = (e: Event) => cb((e as CustomEvent<number>).detail);
  window.addEventListener(WAKE_EVENT, handler);
  return () => window.removeEventListener(WAKE_EVENT, handler);
}
