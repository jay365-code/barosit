import { supabase } from "../auth/supabase";
import { loadEvents, type PostureEvent } from "../pose/eventLog";

interface SyncableEvent extends PostureEvent {
  uploaded?: boolean;
}

const STORAGE_KEY = "posture_events";
const CHUNK_SIZE = 50;
const SYNC_INTERVAL_MS = 800; // 청크 업로드 간 격차 (0.8초 분산)

/**
 * requestIdleCallback 호환 처리 헬퍼
 */
function runOnIdle(callback: () => void) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(callback);
  } else {
    setTimeout(callback, 100);
  }
}

/**
 * 1. 로컬의 posture_events 중 미업로드된 이벤트를 Supabase 서버에 청크 단위로 나누어 백그라운드 전송
 */
export async function syncEventsToServer(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    console.log("[syncService] User is not logged in. Skipping event sync.");
    return;
  }

  const userId = session.user.id;
  const events: SyncableEvent[] = loadEvents();
  
  // 업로드되지 않은 로그만 선별
  const pendingEvents = events.filter(e => !e.uploaded);
  if (pendingEvents.length === 0) {
    return;
  }

  console.log(`[syncService] Found ${pendingEvents.length} pending events to sync. Starting chunked sync...`);

  // 청크 단위로 분할하여 전송 실행
  let index = 0;

  async function processNextChunk() {
    if (index >= pendingEvents.length) {
      // 동기화 완료 후 로컬 스토리지 상태 갱신
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
      console.log("[syncService] All pending events synchronized successfully.");
      return;
    }

    const chunk = pendingEvents.slice(index, index + CHUNK_SIZE);
    
    // Supabase posture_events 테이블 형식에 맞게 데이터 매핑
    const payload = chunk.map(e => ({
      user_id: userId,
      device_id: typeof window !== "undefined" && window.navigator ? window.navigator.userAgent.substring(0, 100) : "web",
      posture_type: e.type,
      duration_secs: e.durationSecs || 0,
      occurred_at: new Date(e.startedAt).toISOString(),
    }));

    try {
      const { error } = await supabase
        .from("posture_events")
        .insert(payload);

      if (error) {
        console.error("[syncService] Chunk upload failed:", error.message);
        return; // 에러 발생 시 부하 방지를 위해 현재 주기 동기화 중단
      }

      // 업로드 성공한 이벤트들 로컬에 마킹
      chunk.forEach(item => {
        const found = events.find(original => original.id === item.id);
        if (found) {
          found.uploaded = true;
        }
      });

      index += CHUNK_SIZE;
      
      // 다음 청크는 SYNC_INTERVAL_MS 뒤에 순차적으로 업로드하여 서버 부하 방지
      setTimeout(() => {
        runOnIdle(processNextChunk);
      }, SYNC_INTERVAL_MS);

    } catch (err) {
      console.error("[syncService] Exception in sync process:", err);
    }
  }

  // 첫 청크 실행을 브라우저 유휴 시간에 예약
  runOnIdle(processNextChunk);
}

/**
 * 2. 가벼운 일별 요약 통계(daily_scores - 단 1행)를 계산하여 Supabase에 실시간 upsert
 */
export async function syncDailyScoreToServer(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return;
  }

  const userId = session.user.id;
  const events = loadEvents();
  
  // 오늘 날짜 구하기 (YYYY-MM-DD)
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const dateStr = String(today.getDate()).padStart(2, "0");
  const todayYYYYMMDD = `${year}-${month}-${dateStr}`;

  // 오늘 하루 동안의 이벤트 필터링
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startMs = startOfDay.getTime();
  
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const endMs = endOfDay.getTime();

  const todaysEvents = events.filter(e => e.startedAt >= startMs && e.startedAt <= endMs);
  
  // 통계 계산
  const violationCount = todaysEvents.length;
  // stretches_today 값 localStorage에서 가져오기
  const stretchesTodayRaw = localStorage.getItem("stretches_today");
  const stretchCount = stretchesTodayRaw ? parseInt(stretchesTodayRaw, 10) || 0 : 0;
  
  // 점수 계산 (기본 100점에서 시작하여 위반 1당 -2점 감점, 최소 0점)
  const avgScore = Math.max(0, 100 - violationCount * 2);

  try {
    const { error } = await supabase
      .from("daily_scores")
      .upsert({
        user_id: userId,
        date: todayYYYYMMDD,
        avg_score: avgScore,
        violation_count: violationCount,
        stretch_count: stretchCount,
      }, { onConflict: "user_id,date" });

    if (error) {
      console.error("[syncService] Daily score upsert failed:", error.message);
    } else {
      console.log("[syncService] Daily score upserted successfully.");
    }
  } catch (err) {
    console.error("[syncService] Exception in daily score upsert:", err);
  }
}

/**
 * 3. 자세 측정 세션 종료 또는 주기적 트리거로 동작하는 종합 동기화 브릿지
 */
export function triggerAutoSync(): void {
  // 브라우저 성능에 지장을 주지 않도록 각각 별도로 비동기 유휴 시간대에 태스크 스케줄링
  runOnIdle(() => {
    syncDailyScoreToServer().catch(err => console.error(err));
  });

  runOnIdle(() => {
    syncEventsToServer().catch(err => console.error(err));
  });
}
