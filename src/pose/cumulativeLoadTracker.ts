/**
 * Phase 2 — 누적 부하 모델 (Cumulative Tissue Load).
 *
 * 운동학적 근거:
 * - Callaghan JP & McGill SM (2001) — 디스크 creep 모델: 짧은 나쁜 자세 episode
 *   가 누적되면 단일 긴 episode 와 비슷한 부하
 * - 현재 BaroSit 은 "단일 episode N초+ 지속" 만 봄 → 짧고 자주 무너지는 패턴
 *   (대부분의 실제 사용자) 미탐
 *
 * 동작:
 * - 자세 타입별로 롤링 30분 윈도우의 누적 위반 시간 추적
 * - 누적 비율이 임계 (기본 25%) 초과 시 알림 발사 (타입별 1회, 쿨다운 후 재발사)
 * - 자세 위반 알림과 별도 카테고리 — "최근 30분 X 자세가 잦았어요"
 */

import type { PostureType } from "./types";

export interface CumulativeLoadConfig {
  enabled: boolean;
  /** 롤링 윈도우 길이 (분). 기본 30 — McGill creep 회복 윈도우 근사. */
  windowMinutes: number;
  /** 알림 발사 임계 (윈도우 대비 누적 비율). 기본 0.25 = 25% (7.5분/30분). */
  threshold: number;
  /** 같은 타입 재발사 쿨다운 (분). 기본 15. */
  cooldownMinutes: number;
}

export const DEFAULT_CUMULATIVE_CONFIG: CumulativeLoadConfig = {
  enabled: true,
  windowMinutes: 30,
  threshold: 0.25,
  cooldownMinutes: 15,
};

export interface CumulativeLoadStatus {
  /** 자세 타입별 윈도우 내 누적 위반 시간(초). UI 표시·디버그용. */
  secsByType: Partial<Record<PostureType, number>>;
  /** 윈도우 크기(초). 비율 계산용. */
  windowSecs: number;
}

export interface CumulativeFiredEvent {
  type: PostureType;
  /** 누적 위반 시간(초) */
  secs: number;
  /** 윈도우 대비 비율 (0.25 = 25%) */
  ratio: number;
}

/** 윈도우 내 위반 episode — 짧은 episode 단위로 저장. */
interface Episode {
  type: PostureType;
  startedAt: number;
  endedAt: number;
}

export class CumulativeLoadTracker {
  private episodes: Episode[] = [];
  private active: Partial<Record<PostureType, number>> = {};
  private lastFiredAt: Partial<Record<PostureType, number>> = {};

  /**
   * 매 프레임 호출. 현재 활성 위반 set 을 받아 episode 시작·종료 추적.
   *
   * 반환값:
   *   - status: 윈도우 내 타입별 누적 시간 (UI 표시용)
   *   - fired: 이번 push 에서 임계 통과한 타입이 있으면 이벤트 (1회)
   */
  push(
    now: number,
    activeViolations: Set<PostureType>,
    config: CumulativeLoadConfig,
  ): { status: CumulativeLoadStatus; fired: CumulativeFiredEvent | null } {
    const windowSecs = config.windowMinutes * 60;
    const windowMs = windowSecs * 1000;
    const cooldownMs = config.cooldownMinutes * 60 * 1000;
    const cutoff = now - windowMs;

    // 활성 위반 진입·이탈 처리
    const seenTypes = new Set<PostureType>();
    for (const t of activeViolations) {
      seenTypes.add(t);
      if (this.active[t] == null) {
        this.active[t] = now;
      }
    }
    // 이전 활성이지만 이번엔 없는 타입 — episode 종료
    for (const t of Object.keys(this.active) as PostureType[]) {
      if (!seenTypes.has(t)) {
        const startedAt = this.active[t]!;
        if (now > startedAt) {
          this.episodes.push({ type: t, startedAt, endedAt: now });
        }
        delete this.active[t];
      }
    }

    // 오래된 episode 제거
    this.episodes = this.episodes.filter((e) => e.endedAt > cutoff);

    // 타입별 누적 시간 계산
    const secsByType: Partial<Record<PostureType, number>> = {};
    for (const e of this.episodes) {
      // episode 가 윈도우와 부분 겹침이면 겹친 부분만 카운트
      const overlapStart = Math.max(e.startedAt, cutoff);
      const overlapEnd = e.endedAt;
      const overlapMs = Math.max(0, overlapEnd - overlapStart);
      secsByType[e.type] = (secsByType[e.type] ?? 0) + overlapMs / 1000;
    }
    // 진행 중 episode 도 포함
    for (const t of Object.keys(this.active) as PostureType[]) {
      const startedAt = this.active[t]!;
      const overlapStart = Math.max(startedAt, cutoff);
      const overlapMs = Math.max(0, now - overlapStart);
      secsByType[t] = (secsByType[t] ?? 0) + overlapMs / 1000;
    }

    // 임계 통과 검사 — 가장 큰 누적 타입 하나만 발사 (다중 알림 방지)
    let fired: CumulativeFiredEvent | null = null;
    if (config.enabled) {
      let bestType: PostureType | null = null;
      let bestRatio = 0;
      for (const t of Object.keys(secsByType) as PostureType[]) {
        const secs = secsByType[t]!;
        const ratio = secs / windowSecs;
        if (ratio < config.threshold) continue;
        const lastFired = this.lastFiredAt[t] ?? 0;
        if (now - lastFired < cooldownMs) continue;
        if (ratio > bestRatio) {
          bestType = t;
          bestRatio = ratio;
        }
      }
      if (bestType) {
        this.lastFiredAt[bestType] = now;
        fired = {
          type: bestType,
          secs: Math.floor(secsByType[bestType]!),
          ratio: bestRatio,
        };
      }
    }

    return {
      status: { secsByType, windowSecs },
      fired,
    };
  }

  reset(): void {
    this.episodes = [];
    this.active = {};
    this.lastFiredAt = {};
  }

  snapshot(): CumulativeLoadStatus {
    return { secsByType: {}, windowSecs: 0 };
  }
}

// ─── 영속화 ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "cumulative_load_config";
export const CUMULATIVE_CONFIG_CHANGED_EVENT =
  "barosit:cumulative-config-changed";

export function loadCumulativeConfig(): CumulativeLoadConfig {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_CUMULATIVE_CONFIG };
  try {
    return {
      ...DEFAULT_CUMULATIVE_CONFIG,
      ...(JSON.parse(raw) as Partial<CumulativeLoadConfig>),
    };
  } catch {
    return { ...DEFAULT_CUMULATIVE_CONFIG };
  }
}

export function saveCumulativeConfig(c: CumulativeLoadConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  try {
    window.dispatchEvent(
      new CustomEvent(CUMULATIVE_CONFIG_CHANGED_EVENT, { detail: c }),
    );
  } catch {
    /* noop */
  }
}
