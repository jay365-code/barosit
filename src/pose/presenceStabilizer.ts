/**
 * Presence 안정화 — 순간적인 포즈 미검출(어깨 visibility 진동, 모델 재생성
 * 1~2초, 조명 노이즈)을 자리비움으로 오판하지 않도록 하는 시간 기반 디바운스.
 *
 * 배경: analyzer 의 personPresent 는 양쪽 어깨 visibility ≥ 0.7 을 프레임
 * 단위로 요구해 경계값에서 진동한다. 이 raw 신호를 그대로 쓰면
 * variabilityTracker 는 10분 윈도우가 매번 리셋되어 정체 알림이 사실상
 * 발사 불가능하고, complianceTracker 는 가짜 부재를 "휴식함"으로 오인한다.
 *
 * 화면 표시(자리비움 배지)는 기존 ABSENCE_GRACE(8초)를 그대로 쓴다 — 이
 * 디바운스는 트래커(시간 장부·윈도우 연속성) 전용이다.
 */

/** 연속 미검출이 이 시간(초)을 넘어야 진짜 부재로 확정. 미만은 검출 노이즈로 간주. */
export const PRESENCE_GRACE_SECS = 30;

export class PresenceDebouncer {
  private lastPresentAt: number | null = null;

  /**
   * 매 프레임 호출. raw 검출 결과를 받아 안정화된 presence 를 반환.
   * 미검출이어도 마지막 검출 후 PRESENCE_GRACE_SECS 이내면 착석 유지로 본다.
   */
  update(now: number, rawPresent: boolean): boolean {
    if (rawPresent) {
      this.lastPresentAt = now;
      return true;
    }
    if (this.lastPresentAt == null) return false;
    return (now - this.lastPresentAt) / 1000 < PRESENCE_GRACE_SECS;
  }

  reset(): void {
    this.lastPresentAt = null;
  }
}
