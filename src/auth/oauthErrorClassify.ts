// 데스크톱 OAuth callback 의 PKCE exchange 실패 분류.
//
// useAuth.signInWithOAuth 의 deep-link/loopback handler 는 실패를 세 갈래로
// 처리한다:
//   1. stale (K2/M1): 이전 시도의 잔여 callback — *조용히* 다음 callback 재대기.
//   2. expired (N1, 2026-07-24): flow state 만료 — 재대기해도 새 callback 이
//      오지 않는 *확정 실패*. 사용자가 provider 인증을 오래 끌었거나 만료된
//      code 만 도착한 경우로, 즉시 loginExpired 안내로 노출한다. (이전엔 만료
//      메시지의 "flow state" 가 K2 패턴에 걸려 무한 silent 대기 = 앱 멈춤으로
//      나타났다.)
//   3. 그 외: 진짜 실패 — 그대로 노출.
//
// 분류는 반드시 expired → stale 순서로 검사할 것: GoTrue 의 만료 메시지
// ("invalid flow state, flow state has expired")는 stale 패턴("flow state")에도
// 매치되기 때문.

// PKCE 검증 단계 stale 에러 패턴 — supabase 가 *throw* 또는 *error 반환* 양쪽
// 모두 같은 메시지 형태이므로 두 경로에서 공용.
const STALE_ERROR_PATTERNS = [
  "code verifier",
  "code challenge",
  "flow state",
  "invalid_grant",
];

export function isStaleExchangeError(msg: string | undefined): boolean {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return STALE_ERROR_PATTERNS.some((p) => lower.includes(p));
}

// supabase-js 가 error_code(AuthApiError.code)를 안 채우는 버전 대비 메시지
// 검사 병행.
export function isExpiredFlowError(err: unknown): boolean {
  if ((err as { code?: string } | null)?.code === "flow_state_expired") return true;
  const lower = (err instanceof Error ? err.message : typeof err === "string" ? err : "")
    .toLowerCase();
  return lower.includes("flow state") && lower.includes("expire");
}
