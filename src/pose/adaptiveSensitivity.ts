/**
 * Phase 4 — 적응형 민감도 (Adaptive Sensitivity).
 *
 * postural muscle 의 시간대별·세션 길이별 자연 피로를 보정. 같은 strict 임계가
 * 오후 4-5시엔 alarm fatigue 를 유발하고, 아침엔 거의 안 뜨는 비대칭을 해소.
 *
 * 근거:
 * - Bridger RS, "Introduction to Ergonomics" — postural muscle EMG 피로 곡선
 *   (작업 시작 2시간+ 후 급격 증가)
 * - Pheasant & Haslegrave, "Bodyspace" — 시간대별 자세 능력 변동
 * - 한국 직장인 평균 hours-of-day fatigue curve
 *
 * 출력은 순수 함수 — 외부 상태/사이드 이펙트 없음. 엔진은 매 프레임 호출해
 * 임계값에 곱하기만 하면 됨.
 */

export interface AdaptiveSensitivityConfig {
  /** 활성화 여부. false 면 항상 1.0 반환. */
  enabled: boolean;
  /** 세션 시작 시각(ms epoch). 사용자가 모니터링 시작한 시점.
   *  null 이면 시간대만 반영. */
  sessionStartedAt: number | null;
}

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveSensitivityConfig = {
  enabled: true,
  sessionStartedAt: null,
};

export interface SensitivityModifier {
  /** 자세 알림 임계에 곱할 값. 1.0=기본, >1.0=덜 민감, <1.0=더 민감.
   *  현재는 항상 ≥1.0 (피로 시 완화 방향만). */
  postureMultiplier: number;
  /** 휴식 알림 임계에 곱할 값. <1.0 이면 더 일찍 휴식 알림 발사.
   *  피로 시 휴식이 더 빨리 권장되어야 함. */
  breakMultiplier: number;
  /** 디버그용 — 적용된 보정 이유 */
  reason: string;
}

const IDENTITY: SensitivityModifier = {
  postureMultiplier: 1.0,
  breakMultiplier: 1.0,
  reason: "identity",
};

/**
 * 현재 시각·세션 길이를 기준으로 보정 계수를 계산.
 *
 * 자세 알림은 피로 시 완화 (multiplier 증가):
 *   - 세션 2h~4h: +0.10
 *   - 세션 4h~6h: +0.20
 *   - 세션 6h+: +0.30
 *   - 13~15시: +0.05 (점심 후 식곤증)
 *   - 16~18시: +0.15 (peak afternoon fatigue)
 *   - 두 보정 중 큰 값 사용 (단순 합산 대신 max — 과도 완화 방지)
 *
 * 휴식 알림은 피로 시 더 빨리 (multiplier 감소):
 *   - 같은 피로 시점에서 자세 multiplier - 1 만큼 break multiplier 감소
 *     (자세 알림 +20% 완화 시 휴식 알림 -20% 빨리 발사)
 */
export function computeSensitivityModifier(
  config: AdaptiveSensitivityConfig,
  now: number,
): SensitivityModifier {
  if (!config.enabled) return IDENTITY;

  // 세션 길이 보정
  let sessionBonus = 0;
  let sessionLabel = "";
  if (config.sessionStartedAt) {
    const hours = (now - config.sessionStartedAt) / (1000 * 60 * 60);
    if (hours >= 6) {
      sessionBonus = 0.3;
      sessionLabel = `세션 ${hours.toFixed(1)}h`;
    } else if (hours >= 4) {
      sessionBonus = 0.2;
      sessionLabel = `세션 ${hours.toFixed(1)}h`;
    } else if (hours >= 2) {
      sessionBonus = 0.1;
      sessionLabel = `세션 ${hours.toFixed(1)}h`;
    }
  }

  // 시간대 보정
  const hour = new Date(now).getHours();
  let timeOfDayBonus = 0;
  let timeLabel = "";
  if (hour >= 16 && hour < 18) {
    timeOfDayBonus = 0.15;
    timeLabel = "오후 피로";
  } else if (hour >= 13 && hour < 15) {
    timeOfDayBonus = 0.05;
    timeLabel = "점심 후";
  }

  // 두 보정 중 큰 값 사용
  const bonus = Math.max(sessionBonus, timeOfDayBonus);
  if (bonus === 0) return IDENTITY;

  const reason =
    sessionBonus >= timeOfDayBonus ? sessionLabel : timeLabel;
  // 자세 multiplier 1.0 + bonus (덜 민감), 휴식 multiplier 1.0 - bonus (더 일찍)
  return {
    postureMultiplier: 1.0 + bonus,
    breakMultiplier: Math.max(0.5, 1.0 - bonus),
    reason: `${reason} (+${(bonus * 100).toFixed(0)}%)`,
  };
}

// ─── 영속화 ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "adaptive_sensitivity";
export const ADAPTIVE_CONFIG_CHANGED_EVENT = "barosit:adaptive-config-changed";

export function loadAdaptiveConfig(): AdaptiveSensitivityConfig {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_ADAPTIVE_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<AdaptiveSensitivityConfig>;
    return {
      ...DEFAULT_ADAPTIVE_CONFIG,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_ADAPTIVE_CONFIG };
  }
}

export function saveAdaptiveConfig(c: AdaptiveSensitivityConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  try {
    window.dispatchEvent(
      new CustomEvent(ADAPTIVE_CONFIG_CHANGED_EVENT, { detail: c }),
    );
  } catch {
    /* noop */
  }
}
