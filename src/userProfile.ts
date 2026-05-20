// 사용자 프로필 — Phase 0: 로컬 stub. 인증·클라우드 동기화는 향후 Phase 1~4
// (docs/auth-sync-plan.md). 현재는 localStorage 만 사용.

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
export const PROFILE_CHANGED_EVENT = "barosit:profile-changed";

export function loadProfile(): UserProfile {
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
  try {
    window.dispatchEvent(
      new CustomEvent(PROFILE_CHANGED_EVENT, { detail: final }),
    );
  } catch {
    /* noop */
  }
}

export const WORK_ENV_LABEL: Record<WorkEnv, string> = {
  laptop: "노트북",
  external_monitor: "외장 모니터",
  mixed: "혼합 사용",
};
