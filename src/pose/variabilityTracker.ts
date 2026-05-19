/**
 * Phase 3 — 자세 변동성 점수 (Postural Variability).
 *
 * 운동학적 근거:
 * - Stuart McGill: "The best posture is the next posture" — 정자세도 너무 오래
 *   유지하면 디스크 정수압이 한 부위에 누적
 * - Falla et al. (2014) — 만성 목 통증 환자에서 자세 변동성이 정상인보다 낮음.
 *   변동성 자체가 건강 지표
 *
 * 동작:
 * - 롤링 10분 윈도우에서 핵심 메트릭(어깨 Y, 코 Y/Z, face pitch)의 표준편차
 *   계산
 * - 표준편차 합 = movement index. 임계 미만 + 윈도우 동안 사용자 착석 유지면
 *   "정체 알림" 발사
 * - Positive framing — "정자세 잘 유지 중. 잠깐 풀어볼까요" (자세 위반 알림과
 *   톤 분리)
 *
 * Phase 1(시간 기반)·Phase 2(누적 부하)와 직교 — 같이 동작.
 */

export interface VariabilityConfig {
  enabled: boolean;
  /** 롤링 윈도우 길이 (분). 기본 10. */
  windowMinutes: number;
  /** Movement index 임계 (이 값 미만이면 정체로 판정).
   *  메트릭 4개의 정규화 표준편차 합산이라 0~수십 범위. 기본 0.6. */
  threshold: number;
  /** 재발사 쿨다운 (분). 기본 15. */
  cooldownMinutes: number;
}

export const DEFAULT_VARIABILITY_CONFIG: VariabilityConfig = {
  enabled: true,
  windowMinutes: 10,
  threshold: 0.6,
  cooldownMinutes: 15,
};

export interface VariabilityStatus {
  /** 현재 movement index — 낮을수록 정체. */
  movementIndex: number;
  /** 윈도우가 채워졌는지 (false 면 아직 판정 안 함). */
  windowFilled: boolean;
}

export interface VariabilityFiredEvent {
  movementIndex: number;
  /** 윈도우 길이(초) — UI 표시 "X분 정체" 용. */
  durationSecs: number;
}

interface Sample {
  t: number; // ms
  sy: number; // shoulder mid Y
  ny: number; // nose Y
  nz: number; // nose Z (face landmark fallback 시 0)
  p: number; // face pitch
}

export class VariabilityTracker {
  private samples: Sample[] = [];
  private lastFiredAt = 0;
  /** 사용자가 윈도우 동안 계속 착석했는지 추적. 자리비움/휴식이 끼면 false. */
  private continuouslyPresent = true;
  /** 가장 최근 자리비움/휴식 발생 시각. 그 이후로 윈도우 만큼 지나야 다시 판정. */
  private lastInterruptedAt: number | null = 0;

  /**
   * 매 프레임 호출.
   *
   * @param now 현재 시각 (ms)
   * @param personPresent 사용자 착석 중
   * @param isResting 휴식 모드 (등받이 완전히 기대기)
   * @param metrics 핵심 메트릭 (analyzer 결과에서 추출)
   */
  push(
    now: number,
    personPresent: boolean,
    isResting: boolean,
    metrics: { sy: number; ny: number; nz: number; p: number } | null,
    config: VariabilityConfig,
  ): { status: VariabilityStatus; fired: VariabilityFiredEvent | null } {
    const windowMs = config.windowMinutes * 60 * 1000;
    const cutoff = now - windowMs;
    const cooldownMs = config.cooldownMinutes * 60 * 1000;

    // 사용자 부재 또는 휴식 진입 → 연속 착석 끊김 표시. 윈도우 새로 채워야 함.
    if (!personPresent || isResting) {
      this.continuouslyPresent = false;
      this.lastInterruptedAt = now;
      this.samples = [];
      return {
        status: { movementIndex: 0, windowFilled: false },
        fired: null,
      };
    }

    // 메트릭 없으면 skip (face 미검출 등). 윈도우 끊김으로 간주.
    if (!metrics) {
      return {
        status: { movementIndex: 0, windowFilled: false },
        fired: null,
      };
    }

    // 사용자 복귀 후 윈도우 다시 채우는 중
    if (!this.continuouslyPresent) {
      this.continuouslyPresent = true;
      this.lastInterruptedAt = now;
    }

    // 샘플 추가 + 오래된 샘플 제거
    this.samples.push({ t: now, ...metrics });
    while (this.samples.length > 0 && this.samples[0].t < cutoff) {
      this.samples.shift();
    }

    // 윈도우 충분히 차고 + 마지막 끊김 이후 윈도우 만큼 지났는지 확인
    const filled =
      this.samples.length >= 30 &&
      (this.lastInterruptedAt == null ||
        now - this.lastInterruptedAt >= windowMs);

    if (!filled) {
      return {
        status: { movementIndex: 0, windowFilled: false },
        fired: null,
      };
    }

    // 표준편차 계산
    const stdev = (xs: number[]): number => {
      if (xs.length < 2) return 0;
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sumSq = xs.reduce((a, x) => a + (x - mean) ** 2, 0);
      return Math.sqrt(sumSq / xs.length);
    };

    const sy = stdev(this.samples.map((s) => s.sy));
    const ny = stdev(this.samples.map((s) => s.ny));
    const nz = stdev(this.samples.map((s) => s.nz));
    const p = stdev(this.samples.map((s) => s.p));

    // 정규화 — 각 메트릭은 다른 스케일이므로 sensitivity 조정.
    // sy/ny/nz 는 정규화 좌표(0~1)이라 stdev 가 작음. pitch 는 rad (0~수십).
    // 가중치는 직관적 — 큰 움직임(어깨/머리)에 비중.
    const movementIndex =
      sy * 100 + // 어깨 Y 변동 — 자세 변화 핵심 지표
      ny * 80 + // 코 Y — 머리 위치 변화
      nz * 40 + // 코 Z — 앞뒤 변화 (face fallback 시 0)
      p * 50; // pitch — 머리 기울임 변화

    let fired: VariabilityFiredEvent | null = null;
    if (
      config.enabled &&
      movementIndex < config.threshold &&
      now - this.lastFiredAt > cooldownMs
    ) {
      this.lastFiredAt = now;
      fired = {
        movementIndex,
        durationSecs: config.windowMinutes * 60,
      };
    }

    return {
      status: { movementIndex, windowFilled: true },
      fired,
    };
  }

  reset(): void {
    this.samples = [];
    this.continuouslyPresent = true;
    this.lastInterruptedAt = 0;
    // lastFiredAt 은 보존 — 쿨다운은 모니터링 세션 전체에서 유효
  }
}

// ─── 영속화 ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "variability_config";
export const VARIABILITY_CONFIG_CHANGED_EVENT =
  "barosit:variability-config-changed";

export function loadVariabilityConfig(): VariabilityConfig {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_VARIABILITY_CONFIG };
  try {
    return {
      ...DEFAULT_VARIABILITY_CONFIG,
      ...(JSON.parse(raw) as Partial<VariabilityConfig>),
    };
  } catch {
    return { ...DEFAULT_VARIABILITY_CONFIG };
  }
}

export function saveVariabilityConfig(c: VariabilityConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  try {
    window.dispatchEvent(
      new CustomEvent(VARIABILITY_CONFIG_CHANGED_EVENT, { detail: c }),
    );
  } catch {
    /* noop */
  }
}
