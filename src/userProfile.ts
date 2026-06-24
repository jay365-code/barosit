// 사용자 프로필 — Phase 0: 로컬 stub. 인증·클라우드 동기화는 향후 Phase 1~4
// (docs/auth-sync-plan.md). 현재는 localStorage 만 사용.

import { supabase } from "./auth/supabase";

export type WorkEnv = "laptop" | "external_monitor" | "mixed";

export interface UserProfile {
  /** 표시명. 빈 문자열 허용 (사용자 미입력) */
  name: string;
  /** 이모지 아바타 (인증 단계에서 이미지 업로드로 확장 예정) */
  avatar: string;
  /** 주 작업 환경 — 향후 자세 분석 보정에 활용 가능 */
  workEnv: WorkEnv;
  /** 첫 프로필 저장 시각 (ms epoch). 단순 메타용. */
  createdAt: number;
}

export const DEFAULT_AVATAR_OPTIONS = [
  "🪑", "🧘", "🌿", "🦴", "🪴", "🐢", "🦒", "🌱", "🦊", "🐰",
];

export const DEFAULT_PROFILE: UserProfile = {
  name: "",
  avatar: "🪑",
  workEnv: "laptop",
  createdAt: 0,
};

const STORAGE_KEY = "user_profile_v1";
// 캐시 소유자(로그인 사용자 id) 각인 키 — 계정 전환 시 이전 계정 이름/아바타 누수 차단.
export const PROFILE_OWNER_KEY = "barosit:profile_owner_uid";
export const PROFILE_CHANGED_EVENT = "barosit:profile-changed";

// 동기적으로 현재 로그인 사용자 id 추출 (supabase 세션은 localStorage 에 동기 저장됨).
// loadProfile 이 useState 초기화(동기)에서 호출되므로 async getSession 대신 사용.
function currentUidSync(): string | null {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.endsWith("-auth-token")) {
        const t = JSON.parse(localStorage.getItem(k) || "null");
        return t?.user?.id ?? null;
      }
    }
  } catch {
    /* noop */
  }
  return null;
}

function clearProfileCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PROFILE_OWNER_KEY);
  } catch {
    /* noop */
  }
}

// 캐시 소유자가 현재 로그인 사용자와 다르면(또는 미각인 레거시) 폐기한다.
// 비워두면 pullProfileFromServer 가 올바른 계정 값으로 재생성한다.
export function reconcileProfileCache(): void {
  const uid = currentUidSync();
  if (!uid) return; // 비로그인 → 보존(다음 로그인 때 재판정)
  let owner: string | null = null;
  try { owner = localStorage.getItem(PROFILE_OWNER_KEY); } catch { /* noop */ }
  const hasCache = (() => { try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; } })();
  // 다른 계정 소유 캐시 OR 소유자 미각인 레거시 캐시 → 안전하게 폐기
  if (hasCache && owner !== uid) clearProfileCache();
}

export function loadProfile(): UserProfile {
  reconcileProfileCache();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_PROFILE };
  try {
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return { ...DEFAULT_PROFILE, ...parsed };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(p: UserProfile): void {
  const final: UserProfile = {
    ...p,
    createdAt: p.createdAt || Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(final));
  // 소유자 각인 — 이후 다른 계정 로그인 시 reconcile 이 이 캐시를 무효화할 수 있게 한다.
  try {
    const uid = currentUidSync();
    if (uid) localStorage.setItem(PROFILE_OWNER_KEY, uid);
  } catch {
    /* noop */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(PROFILE_CHANGED_EVENT, { detail: final }),
    );
  } catch {
    /* noop */
  }
}

// 계정 전환(로그인/로그아웃) 시 캐시 누수 차단 — 모듈 로드 시 1회 구독.
try {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "INITIAL_SESSION") {
      reconcileProfileCache();
    }
  });
} catch {
  /* supabase 미초기화 환경 — 무시 */
}

export const WORK_ENV_LABEL: Record<WorkEnv, string> = {
  laptop: "노트북",
  external_monitor: "외장 모니터",
  mixed: "혼합 사용",
};
