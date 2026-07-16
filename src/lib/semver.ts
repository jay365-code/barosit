/**
 * 최소 semver 비교 유틸. "0.9.10" 같은 major.minor.patch 를 숫자 세그먼트로 비교한다.
 * 프리릴리스/빌드 메타(-, +)는 무시하고 코어만 본다. 강제 업데이트 게이트(updateGate)
 * 와 향후 서버 게이트(2차)가 같은 규칙을 쓰도록 공용 유틸로 분리.
 */

/** "v0.9.10-beta+build" → [0, 9, 10]. 숫자 아닌 세그먼트는 0. */
export function parseVersion(v: string): number[] {
  const core = v.trim().replace(/^v/i, "").split(/[-+]/)[0];
  return core.split(".").map((s) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** a<b → -1, a==b → 0, a>b → 1. 세그먼트 수가 달라도 짧은 쪽을 0 으로 채워 비교. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/**
 * current 가 min 보다 엄격히 낮은가.
 * fail-open: 두 값 중 하나라도 비었거나 min 에 숫자가 전혀 없으면(잘못된 설정)
 * false 를 반환해 절대 차단하지 않는다.
 */
export function isBelowMinVersion(current: string, min: string): boolean {
  if (!current?.trim() || !min?.trim()) return false;
  if (!/\d/.test(min)) return false;
  return compareVersions(current, min) < 0;
}
