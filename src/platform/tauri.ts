import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { PostureStatus, PostureType } from "../pose/types";
import type {
  AlertPayload,
  PlatformAPI,
  Unsubscribe,
  UpdateInfo,
  UpdateProgressEvent,
  WidgetState,
} from "./types";
import { isMinibarVisible, saveAppMode } from "./storage";

const showPostureAlert = async (payload: AlertPayload): Promise<void> => {
  await invoke("show_posture_alert", { payload });
};

const updateStatus = async (status: PostureStatus): Promise<void> => {
  await invoke("update_status", { status });
};

const setTrayI18n = async (labels: Record<string, string>): Promise<void> => {
  await invoke("set_tray_i18n", { labels });
};

const showMainWindow = async (): Promise<void> => {
  await invoke("show_main_window");
};

const hideMainWindow = async (): Promise<void> => {
  await invoke("hide_main_window");
};

const setWidgetVisible = async (visible: boolean): Promise<void> => {
  await invoke("set_widget_visible", { visible });
};

const quitApp = async (): Promise<void> => {
  await invoke("quit_app");
};

const publishWidgetState = async (state: WidgetState): Promise<void> => {
  await emit("widget:state", state);
};

const wrapListen = async <T>(
  channel: string,
  cb: (payload: T) => void,
): Promise<Unsubscribe> => {
  const un: UnlistenFn = await listen<T>(channel, (e) => cb(e.payload));
  return un;
};

const onWidgetState = (cb: (s: WidgetState) => void) =>
  wrapListen<WidgetState>("widget:state", cb);

const onChannelVoid = async (
  channel: string,
  cb: () => void,
): Promise<Unsubscribe> => {
  const un = await listen(channel, () => cb());
  return un;
};

const onPauseEvent = (cb: () => void) =>
  onChannelVoid("monitoring:pause", cb);
const onResumeEvent = (cb: () => void) =>
  onChannelVoid("monitoring:resume", cb);
const onTogglePauseEvent = (cb: () => void) =>
  onChannelVoid("monitoring:toggle-pause", cb);
const onMainCloseRequested = (cb: () => void) =>
  onChannelVoid("main:close-requested", cb);
const onMainReopened = (cb: () => void) =>
  onChannelVoid("main:reopened", cb);

const HANDOVER_DELAY_MS = 250;

const modeLog = (msg: string, detail?: unknown) => {
  const ts = new Date().toISOString().substr(11, 12);
  if (detail !== undefined)
    console.info(`[barosit][mode] ${ts} ${msg}`, detail);
  else console.info(`[barosit][mode] ${ts} ${msg}`);
};

const switchToMainMode = async (): Promise<void> => {
  modeLog("switchToMainMode: start");
  saveAppMode("main");
  if (!isMinibarVisible()) {
    await setWidgetVisible(false);
    modeLog("switchToMainMode: widget hidden");
  }
  await new Promise((r) => setTimeout(r, HANDOVER_DELAY_MS));
  await showMainWindow();
  modeLog("switchToMainMode: main shown");
};

const switchToWidgetMode = async (): Promise<void> => {
  modeLog("switchToWidgetMode: start");
  saveAppMode("widget");
  await hideMainWindow();
  modeLog("switchToWidgetMode: main hidden");
  await new Promise((r) => setTimeout(r, HANDOVER_DELAY_MS));
  await setWidgetVisible(true);
  modeLog("switchToWidgetMode: widget shown");
};

const generateCoachingMessage = async (opts: {
  apiKey: string;
  postureType: PostureType;
  durationSecs: number;
  todayCountForType: number;
  hour: number;
}): Promise<string | null> => {
  try {
    const message = await invoke<string>("generate_coaching_message", {
      apiKey: opts.apiKey,
      postureType: opts.postureType,
      durationSecs: opts.durationSecs,
      todayCountForType: opts.todayCountForType,
      hour: opts.hour,
    });
    return message.trim();
  } catch (e) {
    console.warn("coaching message failed", e);
    return null;
  }
};

const isAutostartEnabled = async (): Promise<boolean | null> => {
  try {
    const m = await import("@tauri-apps/plugin-autostart");
    return await m.isEnabled();
  } catch (e) {
    console.warn("autostart query failed", e);
    return null;
  }
};

const setAutostartEnabled = async (enabled: boolean): Promise<void> => {
  try {
    const m = await import("@tauri-apps/plugin-autostart");
    if (enabled) await m.enable();
    else await m.disable();
  } catch (e) {
    console.warn("autostart toggle failed", e);
  }
};

interface AlertFiredEvent {
  posture_type: PostureType;
  duration_secs: number;
  intensity: number;
  coaching_message: string | null;
}

const showAlertWindow = async (): Promise<void> => {
  try {
    await invoke("show_alert_window");
  } catch (e) {
    console.warn("show_alert_window failed", e);
  }
};

const hideAlertWindow = async (): Promise<void> => {
  try {
    await invoke("hide_alert_window");
  } catch (e) {
    console.warn("hide_alert_window failed", e);
  }
};

const emitAlertFired = async (payload: AlertFiredEvent): Promise<void> => {
  await emit("alert:fired", payload);
};

const onAlertFired = (cb: (p: AlertFiredEvent) => void) =>
  wrapListen<AlertFiredEvent>("alert:fired", cb);

interface BreakReminderEvent {
  stage: "micro" | "standup" | "deep";
  secs: number;
}

const emitBreakReminder = async (payload: BreakReminderEvent): Promise<void> => {
  await emit("break:reminder", payload);
};

const onBreakReminder = (cb: (p: BreakReminderEvent) => void) =>
  wrapListen<BreakReminderEvent>("break:reminder", cb);

interface CumulativeAlertEvent {
  posture_type: PostureType;
  secs: number;
  ratio: number;
}

const emitCumulativeAlert = async (
  payload: CumulativeAlertEvent,
): Promise<void> => {
  await emit("cumulative:alert", payload);
};

const onCumulativeAlert = (cb: (p: CumulativeAlertEvent) => void) =>
  wrapListen<CumulativeAlertEvent>("cumulative:alert", cb);

interface VariabilityAlertEvent {
  movement_index: number;
  duration_secs: number;
}

const emitVariabilityAlert = async (
  payload: VariabilityAlertEvent,
): Promise<void> => {
  await emit("variability:alert", payload);
};

const onVariabilityAlert = (cb: (p: VariabilityAlertEvent) => void) =>
  wrapListen<VariabilityAlertEvent>("variability:alert", cb);

interface ForceBlurEvent {
  active: boolean;
}

const emitForceBlur = async (payload: ForceBlurEvent): Promise<void> => {
  await emit("force:blur", payload);
};

const onForceBlur = (cb: (p: ForceBlurEvent) => void) =>
  wrapListen<ForceBlurEvent>("force:blur", cb);

const checkForUpdate = async (): Promise<UpdateInfo | null> => {
  try {
    const [updater, app] = await Promise.all([
      import("@tauri-apps/plugin-updater"),
      import("@tauri-apps/api/app"),
    ]);
    const update = await updater.check();
    if (!update) return null;
    const currentVersion = await app.getVersion();
    return {
      version: update.version,
      currentVersion,
      date: update.date ?? null,
      body: update.body ?? null,
    };
  } catch (e) {
    console.warn("[barosit][updater] check failed", e);
    return null;
  }
};

const downloadAndInstallUpdate = async (
  onProgress?: (event: UpdateProgressEvent) => void,
): Promise<void> => {
  const updater = await import("@tauri-apps/plugin-updater");
  const update = await updater.check();
  if (!update) throw new Error("no update available");
  await update.downloadAndInstall((event) => {
    if (!onProgress) return;
    if (event.event === "Started") {
      onProgress({
        kind: "started",
        contentLength: event.data.contentLength ?? null,
      });
    } else if (event.event === "Progress") {
      onProgress({
        kind: "progress",
        downloaded: event.data.chunkLength,
        contentLength: null,
      });
    } else if (event.event === "Finished") {
      onProgress({ kind: "finished" });
    }
  });
  const proc = await import("@tauri-apps/plugin-process");
  await proc.relaunch();
};

const getAppVersion = async (): Promise<string> => {
  try {
    const app = await import("@tauri-apps/api/app");
    return await app.getVersion();
  } catch (e) {
    console.warn("[barosit] getAppVersion failed", e);
    return "0.0.0";
  }
};

export const tauriPlatform: PlatformAPI = {
  features: {
    multiWindow: true,
    trayLifecycle: true,
    autostart: true,
    // AI(LLM) 코칭 폐기 — 정적 다국어 코칭으로 대체. (llm.rs/관련 UI는 Phase 5에서 정리)
    llmCoaching: false,
    appQuit: true,
    autoUpdate: true,
  },
  getAppVersion,
  showPostureAlert,
  updateStatus,
  setTrayI18n,
  showMainWindow,
  hideMainWindow,
  setWidgetVisible,
  quitApp,
  switchToMainMode,
  switchToWidgetMode,
  publishWidgetState,
  onWidgetState,
  onPauseEvent,
  onResumeEvent,
  onTogglePauseEvent,
  onMainCloseRequested,
  onMainReopened,
  generateCoachingMessage,
  isAutostartEnabled,
  setAutostartEnabled,
  requestPermissionsForMonitoring: async () => undefined,
  showAlertWindow,
  hideAlertWindow,
  emitAlertFired,
  onAlertFired,
  emitBreakReminder,
  onBreakReminder,
  emitCumulativeAlert,
  onCumulativeAlert,
  emitVariabilityAlert,
  onVariabilityAlert,
  emitForceBlur,
  onForceBlur,
  checkForUpdate,
  downloadAndInstallUpdate,
  openBrowser: async (url: string) => {
    await invoke("open_browser", { url });
  },
  systemIdleSecs: async () => {
    try {
      return await invoke<number>("system_idle_secs");
    } catch {
      return 0;
    }
  },
};
