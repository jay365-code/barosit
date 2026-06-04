// localStorage 백업/복원. API 키는 보안상 제외.

import i18n from "./i18n";

const BACKUP_KEYS = [
  "calibration_baseline",
  "posture_events",
  "posture_score",
  "thresholds",
  "widget_position",
  "widget_state",
  "minibar_visible",
  "monitor_debug_open",
  "app_mode",
  "stretches_today",
  "stretches_yesterday",
  "llm_coaching_enabled",
  "alert_modes",
  "onboarded_v1",
  "break_config",
  "cumulative_load",
  "variability",
  "adaptive_sensitivity",
  "updater_snoozed_version",
  "user_profile_v1",
] as const;

const BACKUP_VERSION = 1;

interface BackupFile {
  app: "BaroSit";
  version: number;
  exportedAt: string;
  data: Record<string, string | null>;
}

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function exportData(): void {
  const data: Record<string, string | null> = {};
  for (const k of BACKUP_KEYS) {
    data[k] = localStorage.getItem(k);
  }
  const file: BackupFile = {
    app: "BaroSit",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `BaroSit-backup-${todayStamp()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importData(file: File): Promise<void> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(i18n.t("errors:backup.parseError"));
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as BackupFile).app !== "BaroSit" ||
    typeof (parsed as BackupFile).version !== "number" ||
    typeof (parsed as BackupFile).data !== "object"
  ) {
    throw new Error(i18n.t("errors:backup.notBarosit"));
  }
  const file_ = parsed as BackupFile;
  if (file_.version > BACKUP_VERSION) {
    throw new Error(i18n.t("errors:backup.newerVersion", { version: file_.version }));
  }
  for (const [k, v] of Object.entries(file_.data)) {
    if (!BACKUP_KEYS.includes(k as (typeof BACKUP_KEYS)[number])) continue;
    if (v === null) {
      localStorage.removeItem(k);
    } else if (typeof v === "string") {
      localStorage.setItem(k, v);
    }
  }
}
