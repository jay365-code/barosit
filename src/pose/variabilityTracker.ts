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
  /**
   * 정체 임계 — movement index 가 이 값 **미만**이면 "한 자세 고정"으로 판정.
   * 실측 캘리브레이션(2026-07-02, MacBook 내장캠): 정지 착석 ≈ 3.4~4.3,
   * 의도적 움직임 ≈ 7.4~7.9 (재조정 가중치 기준). 기본 5.0 = 정지 위·움직임 아래.
   */
  threshold: number;
  /**
   * 움직임 인정 임계 — index 가 이 값 **이상**이어야 "유의미한 움직임"으로 인정
   * (휴식 목표 기여·준수 판정·JITAI 방해가능·위반 완화). 정체 임계와 분리한 이유:
   * 한 선을 공유하면 정지 노이즈가 "운동"으로 인정되어 휴식 목표가 자가 완료되고
   * 블러 에스컬레이션에 도달 불가능해진다(실측으로 확인된 회귀). 기본 6.5.
   */
  movementThreshold: number;
  /** 재발사 쿨다운 (분). 기본 15. */
  cooldownMinutes: number;
}

export const DEFAULT_VARIABILITY_CONFIG: VariabilityConfig = {
  enabled: true,
  windowMinutes: 10,
  threshold: 5.0,
  movementThreshold: 6.5,
  cooldownMinutes: 15,
};

export interface VariabilityStatus {
  /** 현재 movement index — 낮을수록 정체. */
  movementIndex: number;
  /** 윈도우가 채워졌는지 (false 면 아직 판정 안 함). */
  windowFilled: boolean;
  /** 가중치 적용 후 성분별 기여값 — 임계 캘리브레이션 진단용. */
  components?: { sy: number; ny: number; nz: number; p: number };
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
  /**
   * 사용자가 윈도우 동안 계속 착석했는지 추적. 자리비움/휴식이 끼면 false.
   * 초기값 false — 세션 시작을 "끊김"으로 간주해, 첫 프레임에서 lastInterruptedAt
   * 를 now 로 찍고 10분 가드를 무장한다. true 로 두면 lastInterruptedAt=0 과 맞물려
   * 시작 직후 ~4초 정체만으로 오발사된다.
   */
  private continuouslyPresent = false;
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
    // 가중치는 실측 분리도 기반(2026-07-02, 성분 진단 로그): 정지↔움직임 분리가
    // 좋은 위치 신호(sy ×2.8, ny ×2.1)에 비중을 두고, 추정 노이즈가 지배해
    // 분리가 없는 축(nz ×1.2 — MediaPipe z 는 원래 불안정 + face fallback 시 0,
    // pitch ×1.7)는 대폭 축소. 이전 가중치(nz 40/p 50)에서는 정지 상태 index 의
    // 78%가 노이즈 축에서 나와 정체/움직임 판별이 사실상 불가능했다.
    const components = {
      sy: sy * 100, // 어깨 Y 변동 — 자세 변화 핵심 지표
      ny: ny * 80, // 코 Y — 머리 위치 변화
      nz: nz * 5, // 코 Z — 노이즈 지배 축, 진단 가시성용 최소 가중치만
      p: p * 20, // pitch — 신호 약간, 노이즈 절반
    };
    const movementIndex =
      components.sy + components.ny + components.nz + components.p;

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
      status: { movementIndex, windowFilled: true, components },
      fired,
    };
  }

  reset(): void {
    this.samples = [];
    // false — 재개 후 첫 프레임에서 lastInterruptedAt 를 now 로 재무장(초기값과 동일
    // 논리). true 로 두면 10분 가드가 무력화돼 재개 직후 정체 오발사.
    this.continuouslyPresent = false;
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
    const parsed = JSON.parse(raw) as Partial<VariabilityConfig>;
    // 마이그레이션 — 구 스케일 임계(기본 0.6, 노이즈 축 가중치 기준)가 저장돼
    // 있으면 폐기. 재조정된 index 스케일(정지 ≈ 3~4)에서 2 미만 임계는 도달
    // 불가능한 값이라 구 설정으로 확정할 수 있다.
    if (typeof parsed.threshold === "number" && parsed.threshold < 2) {
      delete parsed.threshold;
    }
    if (
      typeof parsed.movementThreshold === "number" &&
      parsed.movementThreshold < 2
    ) {
      delete parsed.movementThreshold;
    }
    return { ...DEFAULT_VARIABILITY_CONFIG, ...parsed };
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
