import type { PostureStatus } from "../pose/types";
import i18n from "../i18n";
import type {
  AlertPayload,
  PlatformAPI,
  Unsubscribe,
  WidgetState,
} from "./types";

const STATUS_EMOJI: Record<PostureStatus, string> = {
  good: "🟢",
  warning: "🟡",
  bad: "🔴",
  paused: "⚪",
  resting: "🌙",
  standing: "🧍",
};

const STATUS_COLOR: Record<PostureStatus, string> = {
  good: "#22c55e",
  warning: "#f59e0b",
  bad: "#ef4444",
  paused: "#9ca3af",
  resting: "#94a3b8",
  standing: "#5b8c7a",
};

const BASE_TITLE = "BaroSit";

let faviconLink: HTMLLinkElement | null = null;
function getFavicon(): HTMLLinkElement {
  if (faviconLink) return faviconLink;
  const existing = document.querySelector<HTMLLinkElement>(
    "link[rel~='icon']",
  );
  if (existing) {
    faviconLink = existing;
  } else {
    const link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
    faviconLink = link;
  }
  return faviconLink;
}

function paintFavicon(color: string): void {
  const link = getFavicon();
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, Math.PI * 2);
  ctx.fill();
  link.href = canvas.toDataURL("image/png");
}

const showPostureAlert = async (payload: AlertPayload): Promise<void> => {
  const label = i18n.exists(`posture:label.${payload.posture_type}`)
    ? i18n.t(`posture:label.${payload.posture_type}`)
    : payload.posture_type;
  const title = i18n.t("notifications:webTitle", { label });
  const body =
    payload.coaching_message ??
    i18n.t("notifications:webBody", { label, secs: payload.duration_secs });

  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: payload.posture_type });
  } catch (e) {
    console.warn("notification failed", e);
  }
};

const updateStatus = async (status: PostureStatus): Promise<void> => {
  document.title = `${STATUS_EMOJI[status]} ${BASE_TITLE}`;
  paintFavicon(STATUS_COLOR[status]);
};

const setTrayI18n = async (_labels: Record<string, string>): Promise<void> => {
  // 웹에는 트레이가 없음 — no-op.
};

const noopAsync = async (): Promise<void> => {
  /* web: no window control */
};

const unsubscribeNoop: Unsubscribe = () => undefined;

const onNothing = async (_cb: () => void): Promise<Unsubscribe> =>
  unsubscribeNoop;

// 위젯/메인 윈도우가 따로 없는 단일 페이지 환경 — BroadcastChannel은 멀티탭에서만
// 의미가 있고 단일 탭 단일 페이지에서는 사실상 no-op. 미래 멀티탭 지원을 위해
// API 형태는 유지하되, 같은 페이지에서 emit→listen은 일어나지 않음.
let widgetChannel: BroadcastChannel | null = null;
function getWidgetChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (widgetChannel) return widgetChannel;
  widgetChannel = new BroadcastChannel("widget_state");
  return widgetChannel;
}

const publishWidgetState = async (state: WidgetState): Promise<void> => {
  const ch = getWidgetChannel();
  ch?.postMessage(state);
};

const onWidgetState = async (
  cb: (s: WidgetState) => void,
): Promise<Unsubscribe> => {
  const ch = getWidgetChannel();
  if (!ch) return unsubscribeNoop;
  const handler = (e: MessageEvent<WidgetState>) => cb(e.data);
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
};

// pause/resume — page visibility를 직접 들으면 useMonitoringEngine 내부에서
// 이미 visibilityChange를 처리하므로 여기서는 외부 신호 없음.
const onPauseEvent = onNothing;
const onResumeEvent = onNothing;
const onTogglePauseEvent = onNothing;
const onMainCloseRequested = onNothing;
const onMainReopened = onNothing;

const generateCoachingMessage = async (): Promise<string | null> => {
  // 웹 1차에서는 LLM 코칭 비활성 (CORS + 키 노출 이슈, v2로 미룸)
  return null;
};

export const webPlatform: PlatformAPI = {
  features: {
    multiWindow: false,
    trayLifecycle: false,
    autostart: false,
    llmCoaching: false,
    appQuit: false,
    autoUpdate: false,
  },
  getAppVersion: async () => import.meta.env.PACKAGE_VERSION ?? "0.0.0",
  showPostureAlert,
  updateStatus,
  setTrayI18n,
  showMainWindow: noopAsync,
  hideMainWindow: noopAsync,
  setWidgetVisible: noopAsync,
  quitApp: noopAsync,
  switchToMainMode: noopAsync,
  switchToWidgetMode: noopAsync,
  publishWidgetState,
  onWidgetState,
  onPauseEvent,
  onResumeEvent,
  onTogglePauseEvent,
  onMainCloseRequested,
  onMainReopened,
  generateCoachingMessage,
  isAutostartEnabled: async () => null,
  setAutostartEnabled: async () => undefined,
  requestPermissionsForMonitoring: async () => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    try {
      await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  },
  showAlertWindow: async () => undefined,
  hideAlertWindow: async () => undefined,
  emitAlertFired: async () => undefined,
  onAlertFired: async () => () => undefined,
  emitBreakReminder: async () => undefined,
  onBreakReminder: async () => () => undefined,
  emitCumulativeAlert: async () => undefined,
  onCumulativeAlert: async () => () => undefined,
  emitVariabilityAlert: async () => undefined,
  onVariabilityAlert: async () => () => undefined,
  emitForceBlur: async () => undefined,
  onForceBlur: async () => () => undefined,
  checkForUpdate: async () => null,
  downloadAndInstallUpdate: async () => undefined,
  openBrowser: async (url: string) => {
    window.open(url, "_blank");
  },
  systemIdleSecs: async () => 0,
};
