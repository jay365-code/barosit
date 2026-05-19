import { useEffect, useRef, useState } from "react";

const MIN = 0;
const MAX = 100;
const INITIAL = 100;
const STORAGE_KEY = "posture_score";
const RECOVERY_BONUS = 2;
const RECOVERY_WINDOW_SECS = 10;
/** 좋은 자세가 이 시간 이상 지속되면 점수를 즉시 100점으로 끌어올림 */
const GOOD_STREAK_JUMP_SECS = 5;

function loadInitial(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null) return INITIAL;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= MIN && n <= MAX) return n;
  return INITIAL;
}

/** 위반 지속 시간(초)에 따른 초당 패널티 */
function penaltyForDuration(secs: number): number {
  if (secs < 2) return 0;       // 짧은 그레이스 — 즉각적인 노이즈만 흡수
  if (secs < 10) return 0.5;
  if (secs < 30) return 1;
  if (secs < 60) return 2;
  return 3;                      // 1분+: 강처벌
}

/** 좋은 자세 지속 시간(초)에 따른 초당 회복량 */
function rewardForStreak(secs: number): number {
  if (secs < 300) return 1;      // 5분 미만
  if (secs < 900) return 2;      // 5~15분
  return 3;                       // 15분+ 집중 보상
}

export interface ScoreInputs {
  /** 활성 위반들의 (안정화된) 지속 시간(초) */
  durations: number[];
  /** 직전 위반 해제 후 경과 시간(초). Infinity면 위반 이력 없음 */
  secsSinceLastClear: number;
  /** 모든 위반 해제 상태가 유지된 시간(초). 위반 중이면 0 */
  goodStreakSecs: number;
  /** 일시정지/자리비움이면 점수 변동 없음 */
  frozen: boolean;
}

/**
 * 매초 갱신되는 자세 점수.
 *
 * 좋음: 연속 시간이 길수록 회복 가속 (1→2→3/초). 위반에서 막 회복한 직후는 일회성 보너스.
 * 위반: 지속 시간이 길수록 패널티 가속 (0→0.5→1.5→3/초). 동시 위반은 합산.
 *
 * 입력은 ref에 매 분석 프레임마다 업데이트되고, 1초 타이머가 그 값을 읽어 점수 갱신.
 */
export function usePostureScore(inputsRef: React.RefObject<ScoreInputs>): number {
  const [score, setScore] = useState<number>(loadInitial);
  const bonusGivenRef = useRef<boolean>(false);

  // 다른 윈도우(메인↔위젯)가 점수 갱신했을 때 storage 이벤트로 동기화 +
  // 윈도우 visible 될 때마다 localStorage 재로드 (suspend 중 놓친 이벤트 보상)
  useEffect(() => {
    const reloadFromStorage = () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw == null) return;
      const n = Number(raw);
      if (Number.isFinite(n) && n >= MIN && n <= MAX) setScore(n);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      const n = Number(e.newValue);
      if (Number.isFinite(n) && n >= MIN && n <= MAX) setScore(n);
    };
    const onVisibility = () => {
      if (!document.hidden) reloadFromStorage();
    };
    const onFocus = () => reloadFromStorage();
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // 스트레칭·기지개 등 외부 보너스 이벤트 리스너 — `posture-bonus` CustomEvent
  useEffect(() => {
    const onBonus = (e: Event) => {
      const amount = (e as CustomEvent<number>).detail;
      if (!Number.isFinite(amount) || amount === 0) return;
      setScore((prev) => {
        const next = prev + amount;
        const clamped = next < MIN ? MIN : next > MAX ? MAX : next;
        localStorage.setItem(STORAGE_KEY, String(Math.round(clamped)));
        return clamped;
      });
    };
    window.addEventListener("posture-bonus", onBonus as EventListener);
    return () =>
      window.removeEventListener("posture-bonus", onBonus as EventListener);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const input = inputsRef.current;
      if (!input || input.frozen) return;

      setScore((prev) => {
        let next: number;
        if (input.durations.length === 0) {
          // 좋음 상태
          if (input.goodStreakSecs >= GOOD_STREAK_JUMP_SECS) {
            // 5초 이상 유지 → 즉시 만점. ring transition이 0.8s 동안 자연 애니메이션.
            next = MAX;
            bonusGivenRef.current = true;
          } else {
            // 0~5초 — 초당 점진 회복
            let delta = rewardForStreak(input.goodStreakSecs);
            // 회복 보너스(10초 이내 회복) — 일회성
            if (
              !bonusGivenRef.current &&
              input.secsSinceLastClear < RECOVERY_WINDOW_SECS &&
              input.secsSinceLastClear !== Infinity
            ) {
              delta += RECOVERY_BONUS;
              bonusGivenRef.current = true;
            }
            next = prev + delta;
          }
        } else {
          // 위반 상태 — 동시 위반 합산
          let total = 0;
          for (const d of input.durations) total += penaltyForDuration(d);
          next = prev - total;
          bonusGivenRef.current = false;
        }

        const clamped = next < MIN ? MIN : next > MAX ? MAX : next;
        if (Math.round(clamped) !== Math.round(prev)) {
          localStorage.setItem(STORAGE_KEY, String(Math.round(clamped)));
        }
        return clamped;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [inputsRef]);

  return Math.round(score);
}
