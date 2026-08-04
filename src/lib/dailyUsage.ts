// 일별 감지 시간 — "평균 사용 시간" 지표의 원천.
//
// 왜 이 경로인가
//   posture_events·daily_scores 는 클라이언트가 PRO 플랜에만 업로드한다
//   (syncService). 유료 전환 시 무료 사용자의 사용 시간이 통째로 사라지므로 그
//   위에 지표를 세울 수 없다. 반면 usage_events 는 플랜 게이트가 없다.
//
//   새 이벤트나 하트비트를 만들지 않는다 — app_opened 이 이미 scope='daily' 로
//   하루 1회 날아가므로, 거기에 숫자를 얹으면 **행 수 증가가 0**이다. 하트비트는
//   사용자당 하루 수백 행을 만드는데, 지금 usage_events 전체가 138행이다.
//
// 값의 출처
//   MonitorView 의 날짜 전환 로직이 이미 `barosit_daily_history` 에
//   `{ "YYYY-MM-DD": { r, v, s, a } }` 형태로 하루치를 봉인해 둔다. `a` 가 그날
//   감지가 돌아간 누적 초다(useMonitoringEngine 이 1초마다 증가시키는
//   active_duration_today 의 마감값). 즉 필요한 숫자는 이미 로컬에 있고, 여기서는
//   읽어서 실어 보내기만 한다.
//
// 왜 최근 7일을 한꺼번에 보내나
//   app_opened 은 앱을 연 날에만 찍힌다. 어제치만 보내면 하루 걸러 쓰는 사용자의
//   중간 날들이 영영 유실된다. 완료된 날 7개를 함께 보내면 다음 실행 때 빈 날이
//   저절로 메워진다(백필). 숫자 7개라 payload 는 200바이트 남짓이다.
//   서버에서는 (user, d) 로 중복 제거하면 된다 — 같은 날이 여러 번 실려도 값이 같다.

const HISTORY_KEY = "barosit_daily_history";
const MAX_DAYS = 7;

export interface DailyUsage {
  /** YYYY-MM-DD (사용자 로컬 시간대 기준 — 날짜 봉인이 클라이언트에서 일어난다) */
  d: string;
  /** 그날 감지가 돌아간 누적 초 */
  s: number;
}

/** 로컬 날짜 키(YYYY-MM-DD). barosit_daily_history 의 키 형식과 같아야 한다. */
export function localDayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 저장된 히스토리에서 **완료된 날**만 최신순으로 뽑는다. 순수 함수 — 테스트 가능.
 *
 * 오늘은 제외한다. 아직 누적 중이라 보내봐야 반쪽 값이고, 내일 실행 때 완성된 값이
 * 어차피 실려 온다.
 */
export function pickCompleteDays(
  history: unknown,
  today: string,
  max = MAX_DAYS,
): DailyUsage[] {
  if (!history || typeof history !== "object") return [];
  const rec = history as Record<string, unknown>;
  return Object.keys(rec)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < today)
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, max)
    .map((d) => {
      const entry = rec[d] as { a?: unknown } | undefined;
      return { d, s: Math.round(Number(entry?.a)) };
    })
    // 손상된 항목(NaN·음수)은 버린다 — 집계 평균을 오염시키지 않기 위함.
    .filter((x) => Number.isFinite(x.s) && x.s >= 0);
}

/**
 * app_opened 이벤트에 실을 props. 값이 없으면 빈 객체 — 키를 억지로 만들지 않는다
 * (빈 배열을 보내면 집계에서 "기록 없음"과 "0초 사용"이 섞인다).
 */
export function dailyUsageProps(now: Date = new Date()): Record<string, unknown> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return {};
    const days = pickCompleteDays(JSON.parse(raw), localDayKey(now));
    return days.length > 0 ? { usage_days: days } : {};
  } catch {
    // 계측 실패가 앱 실행을 막지 않는다.
    return {};
  }
}
