// 데스크톱 앱 모니터링 권한 판정 — 순수 함수(부수효과/외부 의존 없음, 단위테스트 용이).
//
// 정책(§7 E3, 해석 B): 앱은 로그인 + PRO 전용. 비로그인/FREE 는 모니터링 불가(업셀).
// plan 은 서버 검증된 실효 플랜(useEntitlement)에서 온다 — localStorage 직접 신뢰 금지.
export function isMonitoringEntitled(
  user: unknown,
  plan: "free" | "pro" | string | null | undefined,
): boolean {
  return !!user && plan === "pro";
}
