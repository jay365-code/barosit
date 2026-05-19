import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { exportData, importData } from "../dataBackup";
import {
  dispatchAlertFired,
  dispatchBreakReminder,
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
import {
  isCoachingEnabled,
  loadApiKey,
  saveApiKey,
  setCoachingEnabled,
} from "../llmConfig";
import { isPrivacyMode, setPrivacyMode } from "../privacyConfig";
import {
  isMinibarVisible,
  loadAppMode,
  quitApp,
  setMinibarVisible,
  setWidgetVisible,
} from "../ipc";
import { platform } from "../platform";

import type { UpdaterState } from "../updater";

interface Props {
  onClose: () => void;
  updater: UpdaterState;
}

type Preset = "엄격" | "보통" | "관대";
const PRESET_SENSITIVITY: Record<Preset, number> = {
  엄격: 1.0,
  보통: 1.4,
  관대: 1.8,
};
const POSTURE_LABEL: Record<PostureType, string> = {
  forward_head: "거북목",
  chin_resting: "턱 괴임",
  shoulder_tilt: "어깨 기울임",
  slouching: "등 구부정",
  monitor_too_close: "모니터 거리",
  shoulder_asymmetry: "어깨 비대칭",
  head_roll: "머리 좌우 기울임",
};

export function SettingsDrawer({ onClose, updater }: Props) {
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
  const [coaching, setCoaching] = useState<boolean>(() => isCoachingEnabled());
  const [alertModes, setAlertModes] = useState<AlertModes>(() => loadAlertModes());
  const [breakConfig, setBreakConfigState] = useState<BreakConfig>(() => loadBreakConfig());
  const [cumulativeConfig, setCumulativeConfigState] = useState<CumulativeLoadConfig>(() => loadCumulativeConfig());
  const [variabilityConfig, setVariabilityConfigState] = useState<VariabilityConfig>(() => loadVariabilityConfig());
  const [adaptiveConfig, setAdaptiveConfigState] = useState<AdaptiveSensitivityConfig>(() => loadAdaptiveConfig());
  const [theme, setTheme] = useState<ThemeMode>(() => loadThemeMode());

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
  const [apiKey, setApiKey] = useState<string>(() => loadApiKey());
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

  const toggleCoaching = (v: boolean) => {
    setCoaching(v);
    setCoachingEnabled(v);
  };

  const clearEvents = () => {
    if (window.confirm("기록을 모두 지울까요? 되돌릴 수 없습니다.")) {
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
    const ok = window.confirm(
      "데이터를 불러오면 현재 점수·이력·기준 자세·설정이 백업 파일 내용으로 덮어써집니다. 진행할까요?",
    );
    if (!ok) return;
    try {
      await importData(f);
      setImportNotice({ kind: "ok", msg: "복원 완료. 새로 고침합니다…" });
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
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>설정</h3>
          <button
            className="b-icon-btn"
            style={{ width: 28, height: 28 }}
            onClick={onClose}
            title="닫기"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        {/* 알림 / 민감도 */}
        <Section title="알림">
          <PresetRow current={currentPreset} onPick={applyPreset} />
          {(Object.keys(POSTURE_LABEL) as PostureType[]).map((type) => (
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
                {POSTURE_LABEL[type]}
              </span>
              <span style={{ fontSize: 10, color: "var(--b-fg-4)" }}>엄격</span>
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
              <span style={{ fontSize: 10, color: "var(--b-fg-4)" }}>관대</span>
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
              알림 지속 시간
            </span>
            <span
              className="b-num"
              style={{
                fontSize: 12,
                marginLeft: "auto",
                color: "var(--b-fg-3)",
              }}
            >
              {thresholds.forward_head.durationSecs}초
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
        <Section title="알림 강화">
          <Row
            label="화면 가장자리 글로우"
            sub="시야 주변에 펄스로 표시 (작업 흐름 안 깸)"
            v={alertModes.edgeGlow}
            onChange={(v) => setAlertMode("edgeGlow", v)}
          />
          {platform.features.multiWindow && (
            <Row
              label="위젯 일시 확장"
              sub="미니바가 큰 카드로 펼쳐져 자세명/코칭 표시"
              v={alertModes.widgetExpand}
              onChange={(v) => setAlertMode("widgetExpand", v)}
            />
          )}
          <Row
            label="화면 중앙 토스트"
            sub="가장 확실히 인식 — 작업 흐름 잠깐 끊김"
            v={alertModes.fullscreenToast}
            onChange={(v) => setAlertMode("fullscreenToast", v)}
          />
          <Row
            label="사운드"
            sub="짧은 톤 (회의·이어폰 환경 주의)"
            v={alertModes.sound}
            onChange={(v) => setAlertMode("sound", v)}
          />
          <div
            style={{
              fontSize: 11,
              color: "var(--b-fg-3)",
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            잘못된 자세가 <b>{thresholds.forward_head.durationSecs}초 이상 지속</b>되면
            발사. 같은 자세는 5분 쿨다운. 길어질수록 색/지속 시간이 진해집니다.
          </div>
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
              옅게 미리보기
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
              진하게 미리보기
            </button>
          </div>
        </Section>

        {/* 휴식 알림 — 운동학·물리치료 권고 기반 (KOSHA H-30, Cornell 50/10, McGill) */}
        <Section title="휴식 알림">
          <div
            style={{
              fontSize: 11,
              color: "var(--b-fg-3)",
              marginBottom: 10,
              lineHeight: 1.5,
            }}
          >
            정자세를 너무 오래 유지하는 것도 디스크·근육에 부담을 줍니다.
            <br />
            연속 착석 시간에 따라 단계적 환기·휴식을 권유합니다. 자세 점수에는
            영향 주지 않습니다.
          </div>
          <Row
            label="환기 권유 (30분 기본)"
            sub="어깨 으쓱·목 좌우 회전·깊은 호흡 — 가벼운 토스트"
            v={breakConfig.enabled.micro}
            onChange={(v) =>
              updateBreakConfig({
                ...breakConfig,
                enabled: { ...breakConfig.enabled, micro: v },
              })
            }
          />
          <Row
            label="일어서기 권유 (50분 기본)"
            sub="KOSHA 권고 — 1분 걷기 또는 스트레칭"
            v={breakConfig.enabled.standup}
            onChange={(v) =>
              updateBreakConfig({
                ...breakConfig,
                enabled: { ...breakConfig.enabled, standup: v },
              })
            }
          />
          <Row
            label="긴 휴식 권유 (120분 기본)"
            sub="5분 휴식 + 물 한 잔 + 20-20-20 눈 운동"
            v={breakConfig.enabled.deep}
            onChange={(v) =>
              updateBreakConfig({
                ...breakConfig,
                enabled: { ...breakConfig.enabled, deep: v },
              })
            }
          />
          <BreakIntervalRow
            label="환기 간격"
            value={breakConfig.microMinutes}
            min={5}
            max={45}
            step={5}
            onChange={(v) =>
              updateBreakConfig({ ...breakConfig, microMinutes: v })
            }
          />
          <BreakIntervalRow
            label="일어서기 간격"
            value={breakConfig.standupMinutes}
            min={20}
            max={90}
            step={5}
            onChange={(v) =>
              updateBreakConfig({ ...breakConfig, standupMinutes: v })
            }
          />
          <BreakIntervalRow
            label="긴 휴식 간격"
            value={breakConfig.deepMinutes}
            min={60}
            max={180}
            step={10}
            onChange={(v) =>
              updateBreakConfig({ ...breakConfig, deepMinutes: v })
            }
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
              환기 미리보기
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
              일어서기 미리보기
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
              긴 휴식 미리보기
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
            기본값으로 (30 / 50 / 120분)
          </button>
        </Section>

        {/* Phase 2 — 누적 부하 알림 */}
        <Section title="누적 부하 알림">
          <div
            style={{
              fontSize: 11,
              color: "var(--b-fg-3)",
              marginBottom: 10,
              lineHeight: 1.5,
            }}
          >
            짧은 나쁜 자세 episode 가 자주 누적되면 알림. 단일 5초 임계는 안
            넘어도 30분 윈도우 누적 25% 도달 시 환기 권유.
            <br />
            (McGill & Callaghan — 디스크 creep 모델 기반)
          </div>
          <Row
            label="누적 부하 알림 활성화"
            sub="기본 30분 윈도우, 25% 임계, 15분 쿨다운"
            v={cumulativeConfig.enabled}
            onChange={(v) =>
              updateCumulativeConfig({ ...cumulativeConfig, enabled: v })
            }
          />
          <BreakIntervalRow
            label="윈도우 길이"
            value={cumulativeConfig.windowMinutes}
            min={10}
            max={60}
            step={5}
            onChange={(v) =>
              updateCumulativeConfig({ ...cumulativeConfig, windowMinutes: v })
            }
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
              임계 비율
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
              updateCumulativeConfig({ ...DEFAULT_CUMULATIVE_CONFIG })
            }
            style={{
              marginTop: 8,
              width: "100%",
              justifyContent: "center",
              fontSize: 12,
            }}
          >
            기본값으로 (30분 / 25% / 15분 쿨다운)
          </button>
        </Section>

        {/* Phase 3 — 자세 변동성 알림 */}
        <Section title="자세 변동성 알림">
          <div
            style={{
              fontSize: 11,
              color: "var(--b-fg-3)",
              marginBottom: 10,
              lineHeight: 1.5,
            }}
          >
            정자세도 너무 오래 유지하면 디스크 한 부위에 정수압 누적.
            <br />
            10분 윈도우 동안 어깨·머리 움직임이 거의 없으면 "잠깐 풀어볼까요"
            양수 피드백.
            <br />
            (McGill — "best posture is the next posture")
          </div>
          <Row
            label="변동성 알림 활성화"
            sub="기본 10분 윈도우, 정체 임계 0.6, 15분 쿨다운"
            v={variabilityConfig.enabled}
            onChange={(v) =>
              updateVariabilityConfig({ ...variabilityConfig, enabled: v })
            }
          />
          <BreakIntervalRow
            label="윈도우 길이"
            value={variabilityConfig.windowMinutes}
            min={5}
            max={30}
            step={5}
            onChange={(v) =>
              updateVariabilityConfig({ ...variabilityConfig, windowMinutes: v })
            }
          />
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
            기본값으로 (10분 윈도우)
          </button>
        </Section>

        {/* Phase 4 — 적응형 민감도 */}
        <Section title="적응형 민감도">
          <div
            style={{
              fontSize: 11,
              color: "var(--b-fg-3)",
              marginBottom: 10,
              lineHeight: 1.5,
            }}
          >
            오후 4-5시 / 장시간 작업 시 자세 유지 능력 자연 감소.
            <br />
            자동으로 자세 알림 임계 완화 + 휴식 알림 단축.
            <br />
            (Bridger — postural muscle EMG 피로 곡선)
          </div>
          <Row
            label="적응형 민감도 활성화"
            sub="세션 2h+ / 13-15시·16-18시 자동 보정"
            v={adaptiveConfig.enabled}
            onChange={(v) =>
              updateAdaptiveConfig({ ...adaptiveConfig, enabled: v })
            }
          />
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
            기본값으로 (자동 보정 ON)
          </button>
        </Section>

        {/* 프라이버시 */}
        <Section title="프라이버시">
          <Row
            label="실루엣 모드"
            sub="영상 대신 윤곽선만 표시"
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
              영상은 이 컴퓨터를 떠나지 않습니다. 자세 데이터도 로컬에만 저장됩니다.
            </div>
          </div>
        </Section>

        {/* 화면 (테마) */}
        <Section title="화면">
          <div style={{ display: "flex", gap: 6 }}>
            {(["auto", "light", "dark"] as ThemeMode[]).map((m) => {
              const label = m === "auto" ? "자동" : m === "light" ? "라이트" : "다크";
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
            <b>자동</b>: macOS/Windows 시스템 설정을 따라갑니다.
          </div>
        </Section>

        {/* 데스크톱 옵션 */}
        {(platform.features.multiWindow || platform.features.autostart) && (
          <Section title="데스크톱">
            {platform.features.autostart && (
              <Row
                label="시작 시 자동 실행"
                sub={
                  autostart === null
                    ? "상태 확인 중…"
                    : "로그인할 때 자동으로 켜져요"
                }
                v={autostart === true}
                onChange={toggleAutostart}
                disabled={autostart === null}
              />
            )}
            {platform.features.multiWindow && (
              <Row
                label="위젯 미니바 표시"
                sub="작업 창 위에 떠 있어요"
                v={minibar}
                onChange={toggleMinibar}
              />
            )}
          </Section>
        )}

        {/* LLM 코칭 */}
        {platform.features.llmCoaching && (
          <Section title="코칭">
            <Row
              label="AI 코칭 메시지"
              sub="잔소리 대신 한 줄 코칭"
              v={coaching}
              onChange={toggleCoaching}
            />
            <div style={{ marginTop: 10 }}>
              <div
                style={{ fontSize: 12, color: "var(--b-fg-3)", marginBottom: 6 }}
              >
                Anthropic API 키
              </div>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  saveApiKey(e.target.value);
                }}
              />
            </div>
          </Section>
        )}

        {/* 데이터 */}
        <Section title="데이터">
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="b-btn b-btn-ghost"
              onClick={exportData}
              style={{ flex: 1, justifyContent: "center" }}
            >
              내보내기
            </button>
            <button
              className="b-btn b-btn-ghost"
              onClick={handleImportClick}
              style={{ flex: 1, justifyContent: "center" }}
            >
              불러오기
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
            점수·이력·기준 자세·민감도를 JSON으로 백업·복원합니다. API 키는 보안상 제외됩니다.
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
            기록 초기화
          </button>
        </Section>

        {/* 앱 종료 (데스크톱만) */}
        {platform.features.appQuit && (
          <Section title="앱">
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
              {quitConfirm ? "다시 클릭하면 종료됩니다" : "앱 완전 종료"}
            </button>
            <div
              style={{
                fontSize: 11,
                color: "var(--b-fg-3)",
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              메인 창의 X 버튼은 위젯 모드로 전환만 합니다. 완전히 끄려면 위
              버튼을 사용하세요.
            </div>
          </Section>
        )}

        {/* 정보 */}
        {!platform.features.multiWindow && (
          <Section title="데스크톱 앱">
            <div
              style={{
                fontSize: 12,
                color: "var(--b-fg-2)",
                lineHeight: 1.55,
              }}
            >
              백그라운드 모니터링·트레이 알림·플로팅 위젯은 데스크톱 앱에서만
              가능합니다.
            </div>
          </Section>
        )}

        <Section title="정보" last>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--b-fg-2)",
              lineHeight: 1.5,
              marginBottom: 6,
            }}
          >
            {MAIN_SLOGAN}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--b-fg-3)",
              lineHeight: 1.6,
              marginBottom: 8,
            }}
          >
            {pickSubSlogan()}
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
            <span>BaroSit · 버전 0.1.0</span>
            {platform.features.autoUpdate && (
              <button
                className="b-btn b-btn-quiet"
                onClick={() => updater.checkNow()}
                style={{ fontSize: 11, padding: "4px 10px" }}
              >
                업데이트 확인
              </button>
            )}
          </div>
        </Section>
      </aside>
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
}: {
  current: Preset;
  onPick: (p: Preset) => void;
}) {
  const presets: Preset[] = ["엄격", "보통", "관대"];
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
      {presets.map((p) => {
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
            {p}
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
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
        {value}분
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
