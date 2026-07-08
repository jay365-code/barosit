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

// 오프라인 재검증 유예 상한 — 마지막 서버 검증 후 이 기간까지는 오프라인이어도
// 캐시된 PRO 를 유지하고, 초과하면 보수적으로 FREE 로 강등한다(해지/환불된 계정이
// 무한정 오프라인으로 PRO 를 유지하는 것을 방지). 정상 사용자의 일시적 네트워크
// 단절(사내 방화벽·망분리·이동)은 14일 안에 대부분 한 번은 온라인이 되므로 무영향.
export const OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000; // 14일

// 오프라인(서버 재검증 실패) 시 캐시된 PRO 를 강등해야 하는지 판정 — 순수 함수.
//   verifiedAt: 이 기기에서 마지막으로 서버 검증에 성공한 시각(ms epoch). 0/없음 = 검증 이력 없음.
//   now: 현재 시각(ms). 반환 true = FREE 로 강등해야 함.
// 검증 이력이 없거나(캐시를 신뢰 불가), 마지막 검증 후 유예를 초과하면 강등.
export function isOfflineGraceExpired(
  verifiedAt: number,
  now: number,
  graceMs: number = OFFLINE_GRACE_MS,
): boolean {
  if (!verifiedAt || verifiedAt <= 0) return true;
  return now - verifiedAt > graceMs;
}
