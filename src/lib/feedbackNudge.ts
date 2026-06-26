// 능동 피드백 넛지 — 좋은 타이밍에 1회만 부드럽게 의견을 묻는다.
// 수동 버튼(설정 깊숙이)은 응답률이 거의 0 → 정착 사용자에게 1회성으로 노출.
// 과하면 역효과라 빈도는 매우 보수적(1회성), 좌절 직후엔 호출측에서 제외.

const KEY = "feedback_nudge_v1";
const MIN_AGE_MS = 3 * 86400000; // 설치 후 3일 경과
const MIN_SESSIONS = 2; // 최소 2세션(첫 실행 제외)

interface NudgeState {
  firstSeenAt: number;
  sessions: number;
  done: boolean; // 보냈거나 "다음에"로 닫으면 다시 안 띄움
}

function load(): NudgeState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        firstSeenAt: Number(s.firstSeenAt) || 0,
        sessions: Number(s.sessions) || 0,
        done: !!s.done,
      };
    }
  } catch {
    /* ignore */
  }
  return { firstSeenAt: 0, sessions: 0, done: false };
}

function save(s: NudgeState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** 앱 세션 시작 시 1회 호출 — 설치 시각 각인 + 세션 카운트 */
export function recordSession(now = Date.now()): void {
  const s = load();
  if (!s.firstSeenAt) s.firstSeenAt = now;
  s.sessions += 1;
  save(s);
}

/** 넛지를 띄울 조건인가 (설치 3일+ · 2세션+ · 아직 안 함) */
export function shouldShowNudge(now = Date.now()): boolean {
  const s = load();
  if (s.done) return false;
  if (!s.firstSeenAt) return false;
  return now - s.firstSeenAt >= MIN_AGE_MS && s.sessions >= MIN_SESSIONS;
}

/** 보냈거나 닫으면 — 다시 안 띄움 */
export function markNudgeDone(): void {
  const s = load();
  s.done = true;
  save(s);
}

/** 테스트 전용 */
export function __resetNudge(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
