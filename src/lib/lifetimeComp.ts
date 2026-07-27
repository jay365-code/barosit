// 평생 무료(무상 제공) 계정 판정 — 어드민·웹 프로필·데스크톱 프로필이 공유한다.
//
// 판정이 화면마다 갈라지면 "어드민엔 평생 무료인데 사용자 화면엔 월 4,900원"처럼
// 서로 다른 말을 하게 되므로 한 곳에 둔다.
//
// 만료일을 먼 미래로 두는 이유: resolveEffectivePlan(launchMode.ts)이 status='active'
// 에도 current_period_end 가 미래일 것을 요구하고, charge-renewals 는
// current_period_end <= now() 인 행만 청구 대상으로 고른다. 둘을 동시에 만족시키는
// 값이라 카드 없이도 PRO 가 유지되고 청구·강등이 발생하지 않는다.

/** 평생 무료 계정에 부여하는 만료일. */
export const LIFETIME_PERIOD_END = "2099-01-01T00:00:00.000Z";

/** 이 연도 이상이면 평생 무료로 본다. 정확한 문자열 비교는 DB 의 타임존 표기 차이에 깨진다. */
const LIFETIME_YEAR_THRESHOLD = 2090;

export interface LifetimeCompSubscription {
  plan_id?: string | null;
  status?: string | null;
  current_period_end?: string | null;
}

/** 평생 무료로 지정된 구독인가. */
export function isLifetimeComp(sub: LifetimeCompSubscription | null | undefined): boolean {
  if (!sub || sub.plan_id !== "pro" || sub.status !== "active" || !sub.current_period_end) return false;
  const d = new Date(sub.current_period_end);
  return !Number.isNaN(d.getTime()) && d.getFullYear() >= LIFETIME_YEAR_THRESHOLD;
}
