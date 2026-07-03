import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Icon } from "../components/Icon";
import { loadLang, saveLang } from "../i18n/lang";
import { SUPPORTED_LANGS, type Lang } from "../i18n";
import { postureLabel } from "../i18n/posture";
import { exportData, importData } from "../dataBackup";
import {
  dispatchAlertFired,
  dispatchBreakReminder,
  dispatchCumulativeAlert,
  dispatchVariabilityAlert,
  dispatchForceBlur,
  loadAlertModes,
  saveAlertModes,
  type AlertModes,
} from "../alertConfig";
import {
  DEFAULT_BREAK_CONFIG,
  loadBreakConfig,
  saveBreakConfig,
  type BreakConfig,
} from "../pose/breakTracker";
import {
  DEFAULT_CUMULATIVE_CONFIG,
  loadCumulativeConfig,
  saveCumulativeConfig,
  type CumulativeLoadConfig,
} from "../pose/cumulativeLoadTracker";
import {
  DEFAULT_VARIABILITY_CONFIG,
  loadVariabilityConfig,
  saveVariabilityConfig,
  type VariabilityConfig,
} from "../pose/variabilityTracker";
import {
  DEFAULT_ADAPTIVE_CONFIG,
  loadAdaptiveConfig,
  saveAdaptiveConfig,
  computeSensitivityModifier,
  type AdaptiveSensitivityConfig,
} from "../pose/adaptiveSensitivity";
import { MAIN_SLOGAN, pickSubSlogan } from "../slogans";
import { loadThemeMode, saveThemeMode, type ThemeMode } from "../themeConfig";
import {
  loadThresholds,
  saveThresholds,
  THRESHOLDS_CHANGED_EVENT,
  type ThresholdMap,
} from "../pose/thresholds";
import type { PostureType } from "../pose/types";
import { isPrivacyMode, setPrivacyMode } from "../privacyConfig";
import { isErrorReportingEnabled, setErrorReportingEnabled } from "../lib/errorReporting";
import { isUsageAnalyticsEnabled, setUsageAnalyticsEnabled } from "../lib/usageAnalytics";
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from "../lib/syncStatus";
import {
  loadPerformanceProfile,
  setPerformanceProfile,
  type PerformanceProfile,
} from "../performanceConfig";
import {
  isMinibarVisible,
  loadAppMode,
  quitApp,
  setMinibarVisible,
  setWidgetVisible,
} from "../ipc";
import { platform } from "../platform";

import type { UpdaterState } from "../updater";
import type { LegalDocKind } from "../components/LegalDocument";
import { FeedbackModal } from "../components/FeedbackModal";

interface Props {
  onClose: () => void;
  updater: UpdaterState;
  onShowLegal: (kind: LegalDocKind) => void;
  onOpenStretchCalibrate?: () => void;
}

type Preset = "엄격" | "보통" | "관대";
const PRESET_SENSITIVITY: Record<Preset, number> = {
  엄격: 1.0,
  보통: 1.4,
  관대: 1.8,
};
// 표시 라벨은 postureLabel() 헬퍼(posture 네임스페이스)로 통일.
// 여기서는 알림 섹션에서 순회할 자세 유형 목록만 정의.
const POSTURE_TYPES: PostureType[] = [
  "forward_head",
  "chin_resting",
  "shoulder_tilt",
  "slouching",
  "monitor_too_close",
  "shoulder_asymmetry",
  "head_roll",
];

export function SettingsDrawer({ onClose, updater, onShowLegal, onOpenStretchCalibrate }: Props) {
  const [version, setVersion] = useState(
    import.meta.env.PACKAGE_VERSION ?? "",
  );
  useEffect(() => {
    platform.getAppVersion().then(setVersion);
  }, []);

  const [thresholds, setThresholds] = useState<ThresholdMap>(() =>
    loadThresholds(),
  );
  // 메인 인라인 슬라이더 ↔ 드로어 슬라이더 동기화
  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<ThresholdMap>).detail;
      if (detail) setThresholds(detail);
      else setThresholds(loadThresholds());
    };
    window.addEventListener(THRESHOLDS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(THRESHOLDS_CHANGED_EVENT, onChanged);
  }, []);
  const [privacy, setPrivacy] = useState<boolean>(() => isPrivacyMode());
  const [minibar, setMinibar] = useState<boolean>(() => isMinibarVisible());
  const [alertModes, setAlertModes] = useState<AlertModes>(() => loadAlertModes());
  const [breakConfig, setBreakConfigState] = useState<BreakConfig>(() => loadBreakConfig());
  const [cumulativeConfig, setCumulativeConfigState] = useState<CumulativeLoadConfig>(() => loadCumulativeConfig());
  const [variabilityConfig, setVariabilityConfigState] = useState<VariabilityConfig>(() => loadVariabilityConfig());
  const [adaptiveConfig, setAdaptiveConfigState] = useState<AdaptiveSensitivityConfig>(() => loadAdaptiveConfig());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!adaptiveConfig.enabled) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 5000);
    return () => clearInterval(timer);
  }, [adaptiveConfig.enabled]);
  const { t, i18n } = useTranslation("settings");
  const [theme, setTheme] = useState<ThemeMode>(() => loadThemeMode());
  const [lang, setLangState] = useState<Lang>(() => loadLang());
  const [perfProfile, setPerfProfile] = useState<PerformanceProfile>(() =>
    loadPerformanceProfile(),
  );
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [errReport, setErrReport] = useState<boolean>(() => isErrorReportingEnabled());
  const toggleErrReport = (v: boolean) => {
    setErrReport(v);
    setErrorReportingEnabled(v);
  };
  const [usageAnalytics, setUsageAnalytics] = useState<boolean>(() => isUsageAnalyticsEnabled());
  const toggleUsageAnalytics = (v: boolean) => {
    setUsageAnalytics(v);
    setUsageAnalyticsEnabled(v);
  };
  // SYNC-1: 클라우드 동기화 상태 표시(가시화)
  const [syncStatus, setSyncStatusState] = useState<SyncStatus>(() => getSyncStatus());
  useEffect(() => subscribeSyncStatus(setSyncStatusState), []);

  const updateBreakConfig = (next: BreakConfig) => {
    setBreakConfigState(next);
    saveBreakConfig(next);
  };
  const updateCumulativeConfig = (next: CumulativeLoadConfig) => {
    setCumulativeConfigState(next);
    saveCumulativeConfig(next);
  };
  const updateVariabilityConfig = (next: VariabilityConfig) => {
    setVariabilityConfigState(next);
    saveVariabilityConfig(next);
  };
  const updateAdaptiveConfig = (next: AdaptiveSensitivityConfig) => {
    setAdaptiveConfigState(next);
    saveAdaptiveConfig(next);
  };

  const pickTheme = (m: ThemeMode) => {
    setTheme(m);
    saveThemeMode(m);
  };

  const pickLang = (l: Lang) => {
    setLangState(l);
    void saveLang(l);
  };

  const LANG_AUTONYM: Record<Lang, string> = {
    ko: "한국어",
    en: "English",
    ja: "日本語",
  };

  const pickPerfProfile = (p: PerformanceProfile) => {
    setPerfProfile(p);
    setPerformanceProfile(p);
  };

  const setAlertMode = (key: keyof AlertModes, v: boolean) => {
    const next = { ...alertModes, [key]: v };
    setAlertModes(next);
    saveAlertModes(next);
    // 다른 윈도우(위젯·드로어)에 즉시 반영되도록 storage 이벤트 트리거
    try {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "alert_modes",
          newValue: JSON.stringify(next),
        }),
      );
    } catch {
      /* noop */
    }
  };
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [quitConfirm, setQuitConfirm] = useState(false);

  useEffect(() => {
    if (!platform.features.autostart) {
      setAutostart(null);
      return;
    }
    platform
      .isAutostartEnabled()
      .then(setAutostart)
      .catch(() => setAutostart(null));
  }, []);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  useEffect(() => {
    if (!quitConfirm) return;
    const id = window.setTimeout(() => setQuitConfirm(false), 3000);
    return () => window.clearTimeout(id);
  }, [quitConfirm]);

  const update = (
    type: PostureType,
    field: "durationSecs" | "sensitivity",
    value: number,
  ) => {
    const next: ThresholdMap = {
      ...thresholds,
      [type]: { ...thresholds[type], [field]: value },
    };
    setThresholds(next);
    saveThresholds(next);
  };

  const applyPreset = (preset: Preset) => {
    const sensitivity = PRESET_SENSITIVITY[preset];
    const next: ThresholdMap = {
      forward_head: { ...thresholds.forward_head, sensitivity },
      chin_resting: { ...thresholds.chin_resting, sensitivity },
      shoulder_tilt: { ...thresholds.shoulder_tilt, sensitivity },
      slouching: { ...thresholds.slouching, sensitivity },
      monitor_too_close: { ...thresholds.monitor_too_close, sensitivity },
      shoulder_asymmetry: { ...thresholds.shoulder_asymmetry, sensitivity },
      head_roll: { ...thresholds.head_roll, sensitivity },
    };
    setThresholds(next);
    saveThresholds(next);
  };

  const currentPreset: Preset = (() => {
    const s = thresholds.forward_head.sensitivity;
    if (s <= 1.2) return "엄격";
    if (s <= 1.6) return "보통";
    return "관대";
  })();

  const togglePrivacy = (v: boolean) => {
    setPrivacy(v);
    setPrivacyMode(v);
  };

  const toggleMinibar = (v: boolean) => {
    setMinibar(v);
    setMinibarVisible(v);
    const inWidgetMode = loadAppMode() === "widget";
    setWidgetVisible(v || inWidgetMode).catch(() => undefined);
  };

  const toggleAutostart = async (v: boolean) => {
    await platform.setAutostartEnabled(v);
    setAutostart(v);
  };


  const clearEvents = () => {
    if (window.confirm(t("data.clearConfirm"))) {
      localStorage.removeItem("posture_events");
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importNotice, setImportNotice] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const ok = window.confirm(t("data.importConfirm"));
    if (!ok) return;
    try {
      await importData(f);
      setImportNotice({ kind: "ok", msg: t("data.importOk") });
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setImportNotice({
        kind: "err",
        msg: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <>
      <div className="b-drawer-overlay" onClick={onClose} />
      <aside className="b-drawer b-scroll">
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--b-line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            background: "var(--b-bg)",
            zIndex: 2,
          }}
        >
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{t("title")}</h3>
          <button
            className="b-icon-btn"
            style={{ width: 28, height: 28 }}
            onClick={onClose}
            title={t("close")}
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        {/* 알림 / 민감도 */}
        <Section title={t("alerts.title")}>
          <PresetRow current={currentPreset} onPick={applyPreset} t={t} />
          {POSTURE_TYPES.map((type) => (
            <div
              key={type}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 0",
              }}
            >
              <span style={{ fontSize: 13, width: 80 }}>
                {postureLabel(type)}
              </span>
              <span style={{ fontSize: 10, color: "var(--b-fg-4)" }}>
                {t("alerts.rangeStrict")}
              </span>
              <input
                type="range"
                className="b-slider"
                min={0.5}
                max={2}
                step={0.1}
                value={thresholds[type].sensitivity}
                onChange={(e) =>
                  update(type, "sensitivity", Number(e.target.value))
                }
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, color: "var(--b-fg-4)" }}>
                {t("alerts.rangeLax")}
              </span>
              <span
                className="b-num"
                style={{
                  fontSize: 12,
                  width: 28,
                  textAlign: "right",
                  color: "var(--b-fg-3)",
                }}
              >
                {thresholds[type].sensitivity.toFixed(1)}
              </span>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 0",
              marginTop: 4,
              borderTop: "1px solid var(--b-line)",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--b-fg-2)" }}>
              {t("alerts.duration")}
            </span>
            <span
              className="b-num"
              style={{
                fontSize: 12,
                marginLeft: "auto",
                color: "var(--b-fg-3)",
              }}
            >
              {t("alerts.durationSecs", {
                secs: thresholds.forward_head.durationSecs,
              })}
            </span>
            <input
              type="range"
              className="b-slider"
              min={5}
              max={60}
              step={5}
              value={thresholds.forward_head.durationSecs}
              onChange={(e) => {
                const v = Number(e.target.value);
                const next: ThresholdMap = (
                  Object.keys(thresholds) as PostureType[]
                ).reduce((acc, t) => {
                  acc[t] = { ...thresholds[t], durationSecs: v };
                  return acc;
                }, {} as ThresholdMap);
                setThresholds(next);
                saveThresholds(next);
              }}
              style={{ flexBasis: 140 }}
            />
          </div>
        </Section>

        {/* 알림 강화 — 미니바를 놓치는 사용자를 위한 시각/사운드 강조 */}
        <Section title={t("alertBoost.title")}>
          <Row
            label={t("alertBoost.edgeGlow.label")}
            sub={t("alertBoost.edgeGlow.sub")}
            v={alertModes.edgeGlow}
            onChange={(v) => setAlertMode("edgeGlow", v)}
          />
          {platform.features.multiWindow && (
            <Row
              label={t("alertBoost.widgetExpand.label")}
              sub={t("alertBoost.widgetExpand.sub")}
              v={alertModes.widgetExpand}
              onChange={(v) => setAlertMode("widgetExpand", v)}
            />
          )}
          <Row
            label={t("alertBoost.fullscreenToast.label")}
            sub={t("alertBoost.fullscreenToast.sub")}
            v={alertModes.fullscreenToast}
            onChange={(v) => setAlertMode("fullscreenToast", v)}
          />
          <Row
            label={t("alertBoost.sound.label")}
            sub={t("alertBoost.sound.sub")}
            v={alertModes.sound}
            onChange={(v) => setAlertMode("sound", v)}
          />
          <Row
            label={t("alertBoost.focusMode.label")}
            sub={t("alertBoost.focusMode.sub")}
            v={alertModes.focusMode}
            onChange={(v) => setAlertMode("focusMode", v)}
          />
          <Row
            label={t("alertBoost.forceMode.label")}
            sub={t("alertBoost.forceMode.sub")}
            v={alertModes.forceMode}
            onChange={(v) => setAlertMode("forceMode", v)}
          />
          <button
            className="b-btn b-btn-ghost"
            onClick={() => {
              // 미리보기 — 실제 모니터링과 무관하게 블러 veil 을 잠깐 띄웠다 자동
              // 해제. (실사용은 루프가 해제하지만 미리보기는 여기서 직접 끈다.)
              dispatchForceBlur(true);
              window.setTimeout(() => dispatchForceBlur(false), 3500);
            }}
            style={{
              width: "100%",
              justifyContent: "center",
              fontSize: 12,
              marginTop: 8,
            }}
          >
            {t("alertBoost.forcePreview")}
          </button>
          <div
            style={{
              fontSize: 11,
              color: "var(--b-fg-3)",
              marginTop: 6,
              lineHeight: 1.5,
            }}
            dangerouslySetInnerHTML={{
              __html: t("alertBoost.hint", {
                secs: thresholds.forward_head.durationSecs,
              }),
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              className="b-btn b-btn-ghost"
              onClick={() =>
                dispatchAlertFired({
                  postureType: "forward_head",
                  durationSecs: 8,
                  intensity: 0.3,
                  coachingMessage: null,
                })
              }
              style={{ flex: 1, justifyContent: "center", fontSize: 12 }}
            >
              {t("alertBoost.previewLight")}
            </button>
            <button
              className="b-btn b-btn-ghost"
              onClick={() =>
                dispatchAlertFired({
                  postureType: "slouching",
                  durationSecs: 70,
                  intensity: 1.0,
                  coachingMessage: null,
                })
              }
              style={{ flex: 1, justifyContent: "center", fontSize: 12 }}
            >
              {t("alertBoost.previewStrong")}
            </button>
          </div>
        </Section>

        {/* 휴식 알림 — 운동학·물리치료 권고 기반 (KOSHA H-30, Cornell 50/10, McGill) */}
        <Section title={t("break.title")}>
          <div
            style={{
              fontSize: 11,
              color: "var(--b-fg-3)",
              marginBottom: 10,
              lineHeight: 1.5,
            }}
            dangerouslySetInnerHTML={{ __html: t("break.intro") }}
          />
          <Row
            label={t("break.micro.label")}
            sub={t("break.micro.sub")}
            v={breakConfig.enabled.micro}
            onChange={(v) =>
              updateBreakConfig({
                ...breakConfig,
                enabled: { ...breakConfig.enabled, micro: v },
              })
            }
          />
          <Row
            label={t("break.standup.label")}
            sub={t("break.standup.sub")}
            v={breakConfig.enabled.standup}
            onChange={(v) =>
              updateBreakConfig({
                ...breakConfig,
                enabled: { ...breakConfig.enabled, standup: v },
              })
            }
          />
          <Row
            label={t("break.deep.label")}
            sub={t("break.deep.sub")}
            v={breakConfig.enabled.deep}
            onChange={(v) =>
              updateBreakConfig({
                ...breakConfig,
                enabled: { ...breakConfig.enabled, deep: v },
              })
            }
          />
          <BreakIntervalRow
            label={t("break.microInterval")}
            value={breakConfig.microMinutes}
            min={5}
            max={45}
            step={5}
            onChange={(v) =>
              updateBreakConfig({ ...breakConfig, microMinutes: v })
            }
            t={t}
          />
          <BreakIntervalRow
            label={t("break.standupInterval")}
            value={breakConfig.standupMinutes}
            min={20}
            max={90}
            step={5}
            onChange={(v) =>
              updateBreakConfig({ ...breakConfig, standupMinutes: v })
            }
            t={t}
          />
          <BreakIntervalRow
            label={t("break.deepInterval")}
            value={breakConfig.deepMinutes}
            min={60}
            max={180}
            step={10}
            onChange={(v) =>
              updateBreakConfig({ ...breakConfig, deepMinutes: v })
            }
            t={t}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              className="b-btn b-btn-ghost"
              onClick={() =>
                dispatchBreakReminder({
                  stage: "micro",
                  secs: breakConfig.microMinutes * 60,
                })
              }
              style={{ flex: 1, justifyContent: "center", fontSize: 12 }}
            >
              {t("break.previewMicro")}
            </button>
            <button
              className="b-btn b-btn-ghost"
              onClick={() =>
                dispatchBreakReminder({
                  stage: "standup",
                  secs: breakConfig.standupMinutes * 60,
                })
              }
              style={{ flex: 1, justifyContent: "center", fontSize: 12 }}
            >
              {t("break.previewStandup")}
            </button>
            <button
              className="b-btn b-btn-ghost"
              onClick={() =>
                dispatchBreakReminder({
                  stage: "deep",
                  secs: breakConfig.deepMinutes * 60,
                })
              }
              style={{ flex: 1, justifyContent: "center", fontSize: 12 }}
            >
              {t("break.previewDeep")}
            </button>
          </div>
          <button
            className="b-btn b-btn-ghost"
            onClick={() => updateBreakConfig({ ...DEFAULT_BREAK_CONFIG })}
            style={{
              marginTop: 8,
              width: "100%",
              justifyContent: "center",
              fontSize: 12,
            }}
          >
            {t("break.reset")}
          </button>
        </Section>

        {/* Phase 2 — 누적 부하 알림 */}
        <Section title={t("cumulative.title")}>
          <div
            style={{
              fontSize: 11,
              color: "var(--b-fg-3)",
              marginBottom: 10,
              lineHeight: 1.5,
            }}
            dangerouslySetInnerHTML={{ __html: t("cumulative.intro") }}
          />
          <Row
            label={t("cumulative.enable.label")}
            sub={t("cumulative.enable.sub")}
            v={cumulativeConfig.enabled}
            onChange={(v) =>
              updateCumulativeConfig({ ...cumulativeConfig, enabled: v })
            }
          />
          <BreakIntervalRow
            label={t("cumulative.window")}
            value={cumulativeConfig.windowMinutes}
            min={10}
            max={60}
            step={5}
            onChange={(v) =>
              updateCumulativeConfig({ ...cumulativeConfig, windowMinutes: v })
            }
            t={t}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 0",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
              {t("cumulative.threshold")}
            </span>
            <span
              className="b-num"
              style={{
                fontSize: 12,
                marginLeft: "auto",
                color: "var(--b-fg-3)",
              }}
            >
              {Math.round(cumulativeConfig.threshold * 100)}%
            </span>
            <input
              type="range"
              className="b-slider"
              min={10}
              max={50}
              step={5}
              value={Math.round(cumulativeConfig.threshold * 100)}
              onChange={(e) =>
                updateCumulativeConfig({
                  ...cumulativeConfig,
                  threshold: Number(e.target.value) / 100,
                })
              }
              style={{ flexBasis: 140 }}
            />
          </div>
          <button
            className="b-btn b-btn-ghost"
            onClick={() =>
              dispatchCumulativeAlert({
                type: "forward_head",
                secs: 450,
                ratio: 0.25,
              })
            }
            style={{
              marginTop: 8,
              width: "100%",
              justifyContent: "center",
              fontSize: 12,
            }}
          >
            {t("cumulative.preview")}
          </button>
          <button
            className="b-btn b-btn-ghost"
            onClick={() =>
              updateCumulativeConfig({ ...DEFAULT_CUMULATIVE_CONFIG })
            }
            style={{
              marginTop: 8,
              width: "100%",
              justifyContent: "center",
              fontSize: 12,
            }}
          >
            {t("cumulative.reset")}
          </button>
        </Section>

        {/* Phase 3 — 자세 변동성 알림 */}
        <Section title={t("variability.title")}>
          <div
            style={{
              fontSize: 11,
              color: "var(--b-fg-3)",
              marginBottom: 10,
              lineHeight: 1.5,
            }}
            dangerouslySetInnerHTML={{ __html: t("variability.intro") }}
          />
          <Row
            label={t("variability.enable.label")}
            sub={t("variability.enable.sub")}
            v={variabilityConfig.enabled}
            onChange={(v) =>
              updateVariabilityConfig({ ...variabilityConfig, enabled: v })
            }
          />
          <BreakIntervalRow
            label={t("variability.window")}
            value={variabilityConfig.windowMinutes}
            min={5}
            max={30}
            step={5}
            onChange={(v) =>
              updateVariabilityConfig({ ...variabilityConfig, windowMinutes: v })
            }
            t={t}
          />
          <button
            className="b-btn b-btn-ghost"
            onClick={() =>
              dispatchVariabilityAlert({
                movementIndex: 0.15,
                durationSecs: 600,
              })
            }
            style={{
              marginTop: 8,
              width: "100%",
              justifyContent: "center",
              fontSize: 12,
            }}
          >
            {t("variability.preview")}
          </button>
          <button
            className="b-btn b-btn-ghost"
            onClick={() =>
              updateVariabilityConfig({ ...DEFAULT_VARIABILITY_CONFIG })
            }
            style={{
              marginTop: 8,
              width: "100%",
              justifyContent: "center",
              fontSize: 12,
            }}
          >
            {t("variability.reset")}
          </button>
        </Section>

        {/* Phase 4 — 적응형 민감도 */}
        <Section title={t("adaptive.title")}>
          <div
            style={{
              fontSize: 11,
              color: "var(--b-fg-3)",
              marginBottom: 10,
              lineHeight: 1.5,
            }}
            dangerouslySetInnerHTML={{ __html: t("adaptive.intro") }}
          />
          <Row
            label={t("adaptive.enable.label")}
            sub={t("adaptive.enable.sub")}
            v={adaptiveConfig.enabled}
            onChange={(v) =>
              updateAdaptiveConfig({ ...adaptiveConfig, enabled: v })
            }
          />

          {adaptiveConfig.enabled && (() => {
            const modifier = computeSensitivityModifier(adaptiveConfig, now);
            const hasActiveBonus = modifier.postureMultiplier > 1.0 || modifier.breakMultiplier < 1.0;
            return (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "var(--b-sig-bg)",
                  border: "1px solid var(--b-sig-soft)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--b-sig-deep)",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: "var(--b-sig)",
                      animation: "b-pulse 1.5s infinite ease-in-out",
                    }}
                  />
                  {hasActiveBonus ? t("adaptive.active") : t("adaptive.waiting")}
                </div>

                {hasActiveBonus ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--b-fg-2)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                    }}
                  >
                    <div
                      dangerouslySetInnerHTML={{
                        __html: t("adaptive.postureRelax", {
                          pct: ((modifier.postureMultiplier - 1) * 100).toFixed(0),
                        }),
                      }}
                    />
                    <div
                      dangerouslySetInnerHTML={{
                        __html: t("adaptive.breakShorten", {
                          pct: ((1 - modifier.breakMultiplier) * 100).toFixed(0),
                        }),
                      }}
                    />
                    <div style={{ color: "var(--b-fg-3)", marginTop: 2, fontSize: 10 }}>
                      {t("adaptive.reason", { reason: modifier.reason })}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--b-fg-3)", lineHeight: 1.4 }}>
                    {t("adaptive.idleHint")}
                  </div>
                )}
              </div>
            );
          })()}

          <button
            className="b-btn b-btn-ghost"
            onClick={() =>
              updateAdaptiveConfig({ ...DEFAULT_ADAPTIVE_CONFIG })
            }
            style={{
              marginTop: 8,
              width: "100%",
              justifyContent: "center",
              fontSize: 12,
            }}
          >
            {t("adaptive.reset")}
          </button>
        </Section>

        {/* 스트레칭 가동범위 개인화 - 스트레칭 알고리즘 고도화 완료로 보정이 불필요하므로 UI에서만 일시적으로 히든 처리 (코드 보존) */}
        {false && onOpenStretchCalibrate && (
          <Section title={t("stretchCalib.title")}>
            <div
              style={{
                fontSize: 11,
                color: "var(--b-fg-3)",
                marginBottom: 10,
                lineHeight: 1.5,
              }}
            >
              {t("stretchCalib.intro")}
            </div>
            <button
              type="button"
              className="b-btn b-btn-primary"
              onClick={onOpenStretchCalibrate}
              style={{
                width: "100%",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                background: "linear-gradient(135deg, var(--b-sig), #3c5e52)",
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {t("stretchCalib.button")}
            </button>
          </Section>
        )}

        {/* 프라이버시 */}
        <Section title={t("privacy.title")}>
          <Row
            label={t("privacy.silhouette.label")}
            sub={t("privacy.silhouette.sub")}
            v={privacy}
            onChange={togglePrivacy}
          />
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--b-sig-bg)",
              border: "1px solid var(--b-sig-soft)",
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <Icon
              name="shield"
              size={14}
              style={{ color: "var(--b-sig)", marginTop: 2, flexShrink: 0 }}
            />
            <div
              style={{
                fontSize: 12,
                color: "var(--b-fg-2)",
                lineHeight: 1.5,
              }}
            >
              {t("privacy.note")}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Row
              label={t("privacy.errorReport.label")}
              sub={t("privacy.errorReport.sub")}
              v={errReport}
              onChange={toggleErrReport}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <Row
              label={t("privacy.usageAnalytics.label")}
              sub={t("privacy.usageAnalytics.sub")}
              v={usageAnalytics}
              onChange={toggleUsageAnalytics}
            />
          </div>
        </Section>

        {/* 성능 모드 */}
        <Section title={t("performance.title")}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["full", "eco"] as PerformanceProfile[]).map((p) => {
              const label = p === "full" ? t("performance.full") : t("performance.eco");
              const active = perfProfile === p;
              return (
                <button
                  key={p}
                  className="b-btn b-btn-ghost"
                  onClick={() => pickPerfProfile(p)}
                  aria-pressed={active}
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    fontSize: 12,
                    height: 34,
                    color: active ? "var(--b-sig-deep)" : undefined,
                    background: active ? "var(--b-sig-bg)" : undefined,
                    borderColor: active ? "var(--b-sig-soft)" : undefined,
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--b-fg-3)",
              marginTop: 8,
              lineHeight: 1.5,
            }}
            dangerouslySetInnerHTML={{ __html: t("performance.hint") }}
          />
        </Section>

        {/* 언어 */}
        <Section title={t("language")}>
          <div style={{ display: "flex", gap: 6 }}>
            {SUPPORTED_LANGS.map((l) => {
              const active = lang === l;
              return (
                <button
                  key={l}
                  className="b-btn b-btn-ghost"
                  onClick={() => pickLang(l)}
                  aria-pressed={active}
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    fontSize: 12,
                    height: 34,
                    color: active ? "var(--b-sig-deep)" : undefined,
                    background: active ? "var(--b-sig-bg)" : undefined,
                    borderColor: active ? "var(--b-sig-soft)" : undefined,
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {LANG_AUTONYM[l]}
                </button>
              );
            })}
          </div>
        </Section>

        {/* 화면 (테마) */}
        <Section title={t("screen")}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["auto", "light", "dark"] as ThemeMode[]).map((m) => {
              const label = t(`theme.${m}`);
              const active = theme === m;
              return (
                <button
                  key={m}
                  className="b-btn b-btn-ghost"
                  onClick={() => pickTheme(m)}
                  aria-pressed={active}
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    fontSize: 12,
                    height: 34,
                    color: active ? "var(--b-sig-deep)" : undefined,
                    background: active ? "var(--b-sig-bg)" : undefined,
                    borderColor: active ? "var(--b-sig-soft)" : undefined,
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--b-fg-3)",
              marginTop: 8,
              lineHeight: 1.5,
            }}
          >
            <b>{t("theme.auto")}</b>: {t("themeAutoHint")}
          </div>
        </Section>

        {/* 데스크톱 옵션 */}
        {(platform.features.multiWindow || platform.features.autostart) && (
          <Section title={t("desktop.title")}>
            {platform.features.autostart && (
              <Row
                label={t("desktop.autostart.label")}
                sub={
                  autostart === null
                    ? t("desktop.autostart.checking")
                    : t("desktop.autostart.sub")
                }
                v={autostart === true}
                onChange={toggleAutostart}
                disabled={autostart === null}
              />
            )}
            {platform.features.multiWindow && (
              <Row
                label={t("desktop.minibar.label")}
                sub={t("desktop.minibar.sub")}
                v={minibar}
                onChange={toggleMinibar}
              />
            )}
          </Section>
        )}


        {/* 데이터 */}
        <Section title={t("data.title")}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="b-btn b-btn-ghost"
              onClick={exportData}
              style={{ flex: 1, justifyContent: "center" }}
            >
              {t("data.export")}
            </button>
            <button
              className="b-btn b-btn-ghost"
              onClick={handleImportClick}
              style={{ flex: 1, justifyContent: "center" }}
            >
              {t("data.import")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              style={{ display: "none" }}
            />
          </div>
          {importNotice && (
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color:
                  importNotice.kind === "ok"
                    ? "var(--b-sig, #4ade80)"
                    : "var(--b-warn, #f87171)",
              }}
            >
              {importNotice.msg}
            </div>
          )}
          <div
            style={{
              fontSize: 11,
              color: "var(--b-fg-3)",
              marginTop: 8,
              lineHeight: 1.5,
            }}
          >
            {t("data.hint")}
          </div>
          <button
            className="b-btn b-btn-ghost"
            onClick={clearEvents}
            style={{
              width: "100%",
              justifyContent: "center",
              marginTop: 10,
              color: "var(--b-warn)",
              borderColor: "rgba(210,119,88,0.3)",
            }}
          >
            <Icon name="trash" size={13} />
            {t("data.clear")}
          </button>
        </Section>

        {/* 앱 종료 (데스크톱만) */}
        {platform.features.appQuit && (
          <Section title={t("appQuit.title")}>
            <button
              className="b-btn"
              onClick={() => {
                if (quitConfirm) quitApp().catch(() => undefined);
                else setQuitConfirm(true);
              }}
              style={{
                width: "100%",
                justifyContent: "center",
                background: quitConfirm
                  ? "rgba(210, 119, 88, 1)"
                  : "var(--b-warn-soft)",
                color: quitConfirm ? "#fff" : "var(--b-warn)",
                fontWeight: quitConfirm ? 700 : 600,
                border: "1px solid",
                borderColor: quitConfirm ? "var(--b-warn)" : "rgba(210,119,88,0.3)",
              }}
            >
              {quitConfirm ? t("appQuit.confirm") : t("appQuit.button")}
            </button>
            <div
              style={{
                fontSize: 11,
                color: "var(--b-fg-3)",
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              {t("appQuit.hint")}
            </div>
          </Section>
        )}

        {/* 정보 */}
        {!platform.features.multiWindow && (
          <Section title={t("desktopApp.title")}>
            <div
              style={{
                fontSize: 12,
                color: "var(--b-fg-2)",
                lineHeight: 1.55,
              }}
            >
              {t("desktopApp.note")}
            </div>
          </Section>
        )}

        <Section title={t("sync.title")}>
          {(() => {
            const cfg = {
              idle: { color: "var(--b-fg-3)", label: t("sync.state.idle") },
              syncing: { color: "#6ea8fe", label: t("sync.state.syncing") },
              synced: { color: "var(--b-sig)", label: t("sync.state.synced") },
              offline: { color: "#d9a752", label: t("sync.state.offline") },
              error: { color: "#f87171", label: t("sync.state.error") },
            }[syncStatus.state];
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                <span style={{ color: "var(--b-fg-2)", fontWeight: 600 }}>{cfg.label}</span>
                {syncStatus.lastSyncedAt && (
                  <span style={{ color: "var(--b-fg-3)", marginLeft: "auto" }}>
                    {t("sync.lastSynced", {
                      time: new Date(syncStatus.lastSyncedAt).toLocaleString(i18n.language),
                    })}
                  </span>
                )}
              </div>
            );
          })()}
          {(syncStatus.state === "offline" || syncStatus.state === "error") && (
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: "var(--b-fg-3)",
                lineHeight: 1.55,
              }}
            >
              {t("sync.networkNote")}
            </div>
          )}
        </Section>

        <Section title={t("about.title")} last>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--b-fg-2)",
              lineHeight: 1.5,
              marginBottom: 6,
            }}
          >
            {i18n.language === "ko" ? MAIN_SLOGAN : t("app:tagline")}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--b-fg-3)",
              lineHeight: 1.6,
              marginBottom: 8,
            }}
          >
            {i18n.language === "ko" ? pickSubSlogan() : t("app:taglineSub")}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 11,
              color: "var(--b-fg-4)",
              lineHeight: 1.6,
            }}
          >
            <span>{t("about.version", { version })}</span>
            {platform.features.autoUpdate && (
              <button
                className="b-btn b-btn-quiet"
                onClick={() => updater.checkNow()}
                style={{ fontSize: 11, padding: "4px 10px" }}
              >
                {t("about.checkUpdate")}
              </button>
            )}
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 11,
              color: "var(--b-fg-4)",
              display: "flex",
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={() => platform.openBrowser("https://barosit.com/#/changelog")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--b-fg-3)",
                textDecoration: "underline",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "inherit",
              }}
            >
              {t("about.changelog")}
            </button>
            <span style={{ color: "var(--b-line-2)" }}>·</span>
            <button
              type="button"
              onClick={() => onShowLegal("privacy")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--b-fg-3)",
                textDecoration: "underline",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "inherit",
              }}
            >
              {t("about.privacy")}
            </button>
            <span style={{ color: "var(--b-line-2)" }}>·</span>
            <button
              type="button"
              onClick={() => onShowLegal("terms")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--b-fg-3)",
                textDecoration: "underline",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "inherit",
              }}
            >
              {t("about.terms")}
            </button>
          </div>

          <button
            type="button"
            className="b-btn b-btn-quiet"
            onClick={() => setFeedbackOpen(true)}
            style={{ marginTop: 14, fontSize: 12, width: "100%" }}
          >
            💬 {t("feedback.open")}
          </button>
        </Section>
      </aside>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </>
  );
}

function Section({
  title,
  children,
  last,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: "16px 24px",
        borderBottom: last ? "none" : "1px solid var(--b-line)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--b-fg-3)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  sub,
  v,
  onChange,
  disabled,
}: {
  label: string;
  sub?: string;
  v: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "6px 0" }}>
      <div style={{ flex: 1, opacity: disabled ? 0.5 : 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 11, color: "var(--b-fg-3)", marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
      <button
        className={`b-toggle ${v ? "on" : ""}`}
        onClick={() => !disabled && onChange(!v)}
        disabled={disabled}
        type="button"
      />
    </div>
  );
}

function PresetRow({
  current,
  onPick,
  t,
}: {
  current: Preset;
  onPick: (p: Preset) => void;
  t: TFunction;
}) {
  const presets: { key: Preset; labelKey: string }[] = [
    { key: "엄격", labelKey: "preset.strict" },
    { key: "보통", labelKey: "preset.normal" },
    { key: "관대", labelKey: "preset.lax" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
      {presets.map(({ key: p, labelKey }) => {
        const active = p === current;
        return (
          <button
            key={p}
            className="b-btn b-btn-ghost"
            onClick={() => onPick(p)}
            style={{
              flex: 1,
              justifyContent: "center",
              fontSize: 12,
              background: active ? "var(--b-sig-bg)" : "transparent",
              color: active ? "var(--b-sig-deep)" : "var(--b-fg-2)",
              borderColor: active ? "var(--b-sig-soft)" : "var(--b-line-2)",
            }}
          >
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
}

function BreakIntervalRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  t,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  t: TFunction;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 0",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{label}</span>
      <span
        className="b-num"
        style={{ fontSize: 12, marginLeft: "auto", color: "var(--b-fg-3)" }}
      >
        {value}
        {t("minutesSuffix")}
      </span>
      <input
        type="range"
        className="b-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flexBasis: 140 }}
      />
    </div>
  );
}
