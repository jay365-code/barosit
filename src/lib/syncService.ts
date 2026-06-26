import { supabase } from "../auth/supabase";
import { loadEvents, type PostureEvent } from "../pose/eventLog";
import { PROFILE_OWNER_KEY } from "../userProfile";
import { setSyncState } from "./syncStatus";
import i18n from "../i18n";

interface SyncableEvent extends PostureEvent {
  uploaded?: boolean;
}

const STORAGE_KEY = "posture_events";
const CHUNK_SIZE = 50;
const SYNC_INTERVAL_MS = 800; // 청크 업로드 간 격차 (0.8초 분산)

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** posture_events 진행상황을 안전하게 로컬에 영속화 (uploaded 플래그 보존) */
function persistEvents(events: SyncableEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    /* 용량 등 실패는 eventLog 경로에서 별도 처리 */
  }
}

/**
 * SYNC-1: boolean(성공 여부)을 반환하는 동기화 작업을 지수 백오프로 재시도.
 * fn 은 throw 하지 않고 false 를 돌려주는 계약(직접 호출처의 unhandled rejection 방지).
 */
async function withRetry(
  fn: () => Promise<boolean>,
  retries = 2,
  baseDelayMs = 1000,
): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    let ok = false;
    try {
      ok = await fn();
    } catch {
      ok = false;
    }
    if (ok || attempt >= retries) return ok;
    await delay(baseDelayMs * Math.pow(2, attempt)); // 1s, 2s, 4s …
  }
}

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
export async function syncEventsToServer(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return true; // 비로그인 — 할 일 없음(성공으로 간주)

  // FREE 플랜 사용자의 고주파 데이터 서버 전송 원천 차단 (서버 트래픽·DB 비용 최적화)
  const userPlan = localStorage.getItem("barosit:subscription_plan") || "free";
  if (userPlan !== "pro") return true;

  const userId = session.user.id;
  const events: SyncableEvent[] = loadEvents();
  const pendingEvents = events.filter((e) => !e.uploaded);
  if (pendingEvents.length === 0) return true;

  const deviceId =
    typeof window !== "undefined" && window.navigator
      ? window.navigator.userAgent.substring(0, 100)
      : "web";

  // 청크 단위 순차 업로드 — 각 청크 성공 직후 uploaded 플래그를 "증분 영속화"하여
  // 중간 실패 시에도 이미 올린 청크를 재업로드(중복 insert)하지 않게 한다(SYNC-1 버그 수정).
  for (let i = 0; i < pendingEvents.length; i += CHUNK_SIZE) {
    const chunk = pendingEvents.slice(i, i + CHUNK_SIZE);
    const payload = chunk.map((e) => ({
      user_id: userId,
      device_id: deviceId,
      posture_type: e.type,
      duration_secs: e.durationSecs || 0,
      occurred_at: new Date(e.startedAt).toISOString(),
    }));

    let error: { message: string } | null = null;
    try {
      ({ error } = await supabase.from("posture_events").insert(payload));
    } catch (err) {
      error = { message: err instanceof Error ? err.message : String(err) };
    }

    if (error) {
      console.error("[syncService] Chunk upload failed:", error.message);
      persistEvents(events); // 여기까지의 진행상황 보존 후 실패 반환(재시도/상태는 상위에서)
      return false;
    }

    chunk.forEach((item) => {
      const found = events.find((o) => o.id === item.id);
      if (found) found.uploaded = true;
    });
    persistEvents(events); // ← 청크마다 영속화

    if (i + CHUNK_SIZE < pendingEvents.length) await delay(SYNC_INTERVAL_MS);
  }

  return true;
}

/**
 * 2. 가벼운 일별 요약 통계(daily_scores - 단 1행)를 계산하여 Supabase에 실시간 upsert
 */
export async function syncDailyScoreToServer(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return true;

  // FREE 플랜 사용자의 일일 스코어 히스토리 서버 저장 차단 (로컬 저장소 우선 활용)
  const userPlan = localStorage.getItem("barosit:subscription_plan") || "free";
  if (userPlan !== "pro") return true;

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
      return false;
    }
    return true;
  } catch (err) {
    console.error("[syncService] Exception in daily score upsert:", err);
    return false;
  }
}

/**
 * 3. 자세 측정 세션 종료 또는 주기적 트리거로 동작하는 종합 동기화 브릿지
 */
export function triggerAutoSync(): void {
  // 무거운 작업을 유휴 시간대에 시작하되, 내부는 상태/재시도/오프라인을 관리하는 async 흐름
  runOnIdle(() => {
    void runAutoSync();
  });
}

async function runAutoSync(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return; // 비로그인 — 상태 변경 없음

  // SYNC-1: 오프라인이면 시도하지 않고 상태만 노출. 온라인 복귀 시 online 리스너가 재시도.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    setSyncState("offline");
    return;
  }

  setSyncState("syncing");

  // 각 작업을 지수 백오프로 재시도. 모두 성공해야 synced, 하나라도 실패면 error.
  const results = await Promise.all([
    withRetry(syncDailyScoreToServer),
    withRetry(syncEventsToServer),
    withRetry(syncSettingsToServer),
    withRetry(syncProfileToServer),
  ]);

  const allOk = results.every(Boolean);
  if (allOk) {
    setSyncState("synced");
  } else if (typeof navigator !== "undefined" && navigator.onLine === false) {
    setSyncState("offline");
  } else {
    setSyncState("error", "일부 항목 동기화에 실패했습니다.");
  }
}

/**
 * 4. 로컬 설정을 Supabase user_settings 테이블에 동기화 (Last-Write-Wins)
 */
export async function syncSettingsToServer(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return true;

  const userId = session.user.id;

  const getJSON = (key: string) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  };

  // 비즈니스 가치: PRO 플랜일 때만 다중 캘리브레이션 데이터 동기화
  const userPlan = localStorage.getItem("barosit:subscription_plan") || "free";
  const isPro = userPlan === "pro";

  const payload = {
    user_id: userId,
    thresholds: getJSON("thresholds"),
    alert_modes: getJSON("alert_modes"),
    break_config: getJSON("break_config"),
    cumulative_load: getJSON("cumulative_load_config"),
    variability: getJSON("variability_config"),
    adaptive_sensitivity: getJSON("adaptive_sensitivity"),
    // PRO 플랜일 때만 캘리브레이션 데이터를 클라우드로 전송하여 다른 기기에서 복구 가능케 함
    calibration_baseline_multi: isPro ? getJSON("calibration_baseline_multi") : null,
    calibration_baseline: isPro ? getJSON("calibration_baseline") : null,
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase
      .from("user_settings")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      console.error("[syncService] Settings upload failed:", error.message);
      return false;
    }
    // 업로드 성공 시 로컬의 settings_last_synced_at 갱신
    localStorage.setItem("barosit:settings_last_synced_at", payload.updated_at);
    return true;
  } catch (err) {
    console.error("[syncService] Exception in settings sync:", err);
    return false;
  }
}

/**
 * 5. Supabase 서버에서 설정을 받아 로컬 스토리지에 복원
 */
export async function pullSettingsFromServer(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  const userId = session.user.id;
  const localLastSynced = localStorage.getItem("barosit:settings_last_synced_at");

  try {
    // 1. 가볍게 updated_at 값만 먼저 가져와서 비교하는 초경량 사전 체크 로직 추가
    const { data: timeCheck, error: timeError } = await supabase
      .from("user_settings")
      .select("updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (timeError) {
      console.error("[syncService] Failed to fetch settings updated_at:", timeError.message);
      return;
    }

    if (timeCheck && timeCheck.updated_at) {
      const serverUpdatedAt = new Date(timeCheck.updated_at).getTime();
      const localSyncedTime = localLastSynced ? new Date(localLastSynced).getTime() : 0;

      // 만약 로컬이 최신이거나 같으면 무거운 설정 풀(Pull) 요청을 즉시 바이패스(Bypass)
      if (localSyncedTime >= serverUpdatedAt) {
        console.log("[syncService] Local cache is up-to-date. Bypassing cloud settings pull.");
        return;
      }
    } else if (!timeCheck) {
      // 서버에 데이터가 아예 없으면 최초 가입자로 간주하고 현재 로컬 설정을 서버로 즉시 업로드
      console.log("[syncService] No settings found on server. Uploading current local settings...");
      await syncSettingsToServer();
      return;
    }

    // 2. 서버 측이 더 최신인 경우에만 실제 캘리브레이션 세트 전체가 담긴 settings를 pull 받음
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[syncService] Failed to pull settings from server:", error.message);
      return;
    }

    if (data) {
      const setItem = (key: string, val: any) => {
        if (val) localStorage.setItem(key, JSON.stringify(val));
      };

      setItem("thresholds", data.thresholds);
      setItem("alert_modes", data.alert_modes);
      setItem("break_config", data.break_config);
      setItem("cumulative_load_config", data.cumulative_load);
      setItem("variability_config", data.variability);
      setItem("adaptive_sensitivity", data.adaptive_sensitivity);

      // PRO 구독 등급일 때만 캘리브레이션 클라우드 스토어 복원
      const userPlan = localStorage.getItem("barosit:subscription_plan") || "free";
      if (userPlan === "pro") {
        setItem("calibration_baseline_multi", data.calibration_baseline_multi);
        setItem("calibration_baseline", data.calibration_baseline);
      }

      // 설정 변경 사항 전파용 커스텀 스토리지 이벤트 디스패치
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "alert_modes",
          newValue: JSON.stringify(data.alert_modes),
        })
      );
      // thresholds 변경 통보
      window.dispatchEvent(new CustomEvent("barosit:thresholds-changed", { detail: data.thresholds }));

      // 로컬에 마지막 동기화 완료 시간 갱신
      localStorage.setItem("barosit:settings_last_synced_at", data.updated_at || new Date().toISOString());

      console.log("[syncService] Settings pulled from cloud and restored locally.");
    }
  } catch (err) {
    console.error("[syncService] Exception in pulling settings:", err);
  }
}

/**
 * 6. 로컬 프로필을 Supabase profiles 테이블에 업로드
 */
export async function syncProfileToServer(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return true;

  const userId = session.user.id;
  const raw = localStorage.getItem("user_profile_v1");
  if (!raw) return true;

  try {
    const profile = JSON.parse(raw);

    // 아바타 필드는 더 이상 사용자가 변경할 수 없는 UI 가 됐습니다. 그러나
    // 기존 사용자의 프로필 데이터 호환을 위해 *서버에 저장된 값이 있으면
    // 그대로 둠* — 로컬에서 기본값(🪑)으로 덮어쓰지 않도록 avatar 필드는
    // upsert payload 에 포함하지 않습니다.
    const updatePayload: any = {
      id: userId,
      name: profile.name,
      work_env: profile.workEnv,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("profiles")
      .upsert(updatePayload, { onConflict: "id" });

    if (error) {
      console.error("[syncService] Profile upload failed (upsert):", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[syncService] Exception in profile sync:", err);
    return false;
  }
}

/**
 * 7. Supabase 서버에서 프로필을 조회하여 로컬 복원
 */
export async function pullProfileFromServer(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  const userId = session.user.id;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("name, avatar, work_env")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[syncService] Failed to pull profile from server:", error.message);
      return;
    }

    if (data) {
      // 아바타 자동 적용/복원 로직 제거 — provider 별 URL 차이 (Google
      // picture / Kakao avatar_url) + referer 정책 + CDN 차단 + DOM 충돌
      // 등 부수 이슈가 너무 많아 UI 에서 표시도 안 함. 서버의 avatar
      // 값은 그대로 두되 로컬 표시는 이름 이니셜로 통일.
      const avatar = data.avatar || "🪑";
      const localProfile = {
        name: data.name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || i18n.t("common:userFallback"),
        avatar: avatar,
        workEnv: data.work_env || "mixed",
      };
      localStorage.setItem("user_profile_v1", JSON.stringify(localProfile));
      // 캐시 소유자 각인 — 계정 전환 시 reconcileProfileCache 가 누수를 차단할 수 있게.
      localStorage.setItem(PROFILE_OWNER_KEY, userId);

      // 프로필 변경 통지용 이벤트 발송 (CustomEvent로 디테일 전달)
      window.dispatchEvent(
        new CustomEvent("barosit:profile-changed", { detail: localProfile })
      );
      console.log("[syncService] Profile pulled from cloud and restored locally.");
    }
  } catch (err) {
    console.error("[syncService] Exception in pulling profile:", err);
  }
}

// 8. 네트워크 상태 전환 바인딩
if (typeof window !== "undefined") {
  // 온라인 복귀 → 보류 중인(uploaded=false) 큐를 자동 flush
  window.addEventListener("online", () => {
    console.log("[syncService] Network connection restored. Triggering cloud auto-sync...");
    triggerAutoSync();
  });
  // 오프라인 전환 → 상태 즉시 가시화 (조용히 실패 방지)
  window.addEventListener("offline", () => {
    setSyncState("offline");
  });
}

