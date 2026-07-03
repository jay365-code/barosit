import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_THRESHOLDS,
  loadThresholds,
  saveThresholds,
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
import { isMinibarVisible, loadAppMode, quitApp, setMinibarVisible, setWidgetVisible } from "../ipc";
import { platform } from "../platform";
import { exportData, importData } from "../dataBackup";

const POSTURE_LABELS: Record<PostureType, string> = {
  forward_head: "거북목",
  chin_resting: "턱 괴임",
  shoulder_tilt: "어깨 기울임",
  slouching: "등 구부정",
  monitor_too_close: "모니터가 너무 가까움",
  shoulder_asymmetry: "어깨 비대칭",
  head_roll: "머리 좌우 기울임",
};

export function SettingsView() {
  const [thresholds, setThresholds] = useState<ThresholdMap>(() =>
    loadThresholds(),
  );
  const [apiKey, setApiKey] = useState(() => loadApiKey());
  const [coachingEnabled, setCoachingEnabledState] = useState(() =>
    isCoachingEnabled(),
  );
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [privacy, setPrivacy] = useState<boolean>(() => isPrivacyMode());
  const [minibar, setMinibar] = useState<boolean>(() => isMinibarVisible());

  const toggleMinibar = (visible: boolean) => {
    setMinibar(visible);
    setMinibarVisible(visible);
    // 위젯 모드면 카메라 아이콘이 떠 있어야 하므로 visible 유지
    const inWidgetMode = loadAppMode() === "widget";
    setWidgetVisible(visible || inWidgetMode).catch(() => undefined);
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
      setImportNotice({
        kind: "ok",
        msg: "복원 완료. 변경 사항을 적용하려면 페이지를 새로 고침합니다…",
      });
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setImportNotice({
        kind: "err",
        msg: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const [quitConfirm, setQuitConfirm] = useState(false);
  useEffect(() => {
    if (!quitConfirm) return;
    const id = window.setTimeout(() => setQuitConfirm(false), 3000);
    return () => window.clearTimeout(id);
  }, [quitConfirm]);

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

  const toggleAutostart = async (enabled: boolean) => {
    await platform.setAutostartEnabled(enabled);
    setAutostart(enabled);
  };

  const update = (
    type: PostureType,
    field: "durationSecs" | "sensitivity",
    value: number,
  ) => {
    const next = {
      ...thresholds,
      [type]: { ...thresholds[type], [field]: value },
    };
    setThresholds(next);
    saveThresholds(next);
  };

  const reset = () => {
    setThresholds({ ...DEFAULT_THRESHOLDS });
    saveThresholds({ ...DEFAULT_THRESHOLDS });
  };

  return (
    <div className="settings">
      <h2 style={{ margin: 0 }}>설정</h2>
      <p className="hint" style={{ color: "var(--text-dim)", marginTop: "-0.5rem" }}>
        자세별 알림이 너무 잦으면 지속 시간을 늘리거나 민감도 값을 높이세요(관대 쪽).
      </p>

      {(Object.keys(POSTURE_LABELS) as PostureType[]).map((type) => (
        <div key={type} className="setting-row">
          <label>{POSTURE_LABELS[type]}</label>
          <div className="desc">
            잘못된 자세가 N초 지속되면 알림 / 민감도 1.0이 기본값
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <div>
              <div className="desc">알림 지속 시간 (초)</div>
              <input
                type="number"
                min={5}
                max={600}
                value={thresholds[type].durationSecs}
                onChange={(e) =>
                  update(type, "durationSecs", Number(e.target.value))
                }
              />
            </div>
            <div>
              <div className="desc">민감도 (0.5 엄격 ~ 2.0 관대)</div>
              <input
                type="number"
                min={0.5}
                max={2.0}
                step={0.1}
                value={thresholds[type].sensitivity}
                onChange={(e) =>
                  update(type, "sensitivity", Number(e.target.value))
                }
              />
            </div>
          </div>
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={reset}>기본값으로 되돌리기</button>
      </div>

      {platform.features.multiWindow && (
        <>
          <h2 style={{ margin: "1rem 0 0" }}>위젯 모드</h2>
          <div className="setting-row">
            <label>
              <input
                type="checkbox"
                checked={minibar}
                onChange={(e) => toggleMinibar(e.target.checked)}
                style={{ marginRight: "0.4rem" }}
              />
              위젯에 미니바 표시 (상태·점수 알약)
            </label>
            <div className="desc">
              끄면 카메라 아이콘만 보입니다. 더 작고 조용한 위젯. 메인 창의
              "위젯 모드로 전환" 버튼으로 진입, 위젯 아이콘 클릭으로 메인 창
              복귀.
            </div>
          </div>
        </>
      )}

      <h2 style={{ margin: "1rem 0 0" }}>프라이버시</h2>
      <div className="setting-row">
        <label>
          <input
            type="checkbox"
            checked={privacy}
            onChange={(e) => {
              setPrivacy(e.target.checked);
              setPrivacyMode(e.target.checked);
            }}
            style={{ marginRight: "0.4rem" }}
          />
          실루엣 모드 (영상 대신 윤곽만 표시)
        </label>
        <div className="desc">
          카메라 영상이 화면에 표시되지 않고 자세 랜드마크로 합성한 실루엣만
          보입니다. 자세 감지는 동일하게 동작합니다.
        </div>
      </div>

      {platform.features.llmCoaching && (
        <>
          <h2 style={{ margin: "1rem 0 0" }}>LLM 코칭 (선택)</h2>
          <p className="hint" style={{ color: "var(--text-dim)", marginTop: "-0.5rem" }}>
            알림 시 Anthropic Claude가 맞춤형 자세 코칭 메시지를 만들어줍니다.
            카메라 영상은 절대 전송되지 않으며, 자세 종류·지속 시간 같은 텍스트만
            전송됩니다.
          </p>

          <div className="setting-row">
            <label>
              <input
                type="checkbox"
                checked={coachingEnabled}
                onChange={(e) => {
                  setCoachingEnabledState(e.target.checked);
                  setCoachingEnabled(e.target.checked);
                }}
                style={{ marginRight: "0.4rem" }}
              />
              LLM 코칭 활성화
            </label>
            <div className="desc">비활성화 시 기본 알림 메시지로 동작합니다.</div>
          </div>

          <div className="setting-row">
            <label>Anthropic API 키</label>
            <div className="desc">
              sk-ant-... 형식. 키는 이 컴퓨터의 localStorage에만 저장됩니다.
            </div>
            <input
              type="password"
              value={apiKey}
              placeholder="sk-ant-..."
              onChange={(e) => {
                setApiKey(e.target.value);
                saveApiKey(e.target.value);
              }}
            />
          </div>
        </>
      )}

      {platform.features.autostart && (
        <>
          <h2 style={{ margin: "1rem 0 0" }}>시작 옵션</h2>
          <div className="setting-row">
            <label>
              <input
                type="checkbox"
                checked={autostart === true}
                disabled={autostart === null}
                onChange={(e) => toggleAutostart(e.target.checked)}
                style={{ marginRight: "0.4rem" }}
              />
              로그인 시 자동 시작
            </label>
            <div className="desc">
              {autostart === null
                ? "자동 시작 상태 확인 중…"
                : "활성화하면 컴퓨터에 로그인할 때 BaroSit이 자동으로 실행됩니다."}
            </div>
          </div>
        </>
      )}

      <h2 style={{ margin: "1rem 0 0" }}>데이터 백업</h2>
      <p className="hint" style={{ color: "var(--text-dim)", marginTop: "-0.5rem" }}>
        점수·이벤트 이력·기준 자세·민감도 설정을 JSON 파일로 내보내거나 다른
        기기에서 불러올 수 있습니다. (API 키는 보안상 백업되지 않습니다.)
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button onClick={exportData}>데이터 내보내기</button>
        <button onClick={handleImportClick}>데이터 불러오기</button>
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
          className="hint"
          style={{
            color: importNotice.kind === "ok" ? "var(--b-sig, #4ade80)" : "#f87171",
            marginTop: "0.4rem",
            fontSize: 12,
          }}
        >
          {importNotice.msg}
        </div>
      )}

      {platform.features.appQuit && (
        <>
          <h2 style={{ margin: "1rem 0 0" }}>앱 종료</h2>
          <p className="hint" style={{ color: "var(--text-dim)", marginTop: "-0.5rem" }}>
            앱을 완전히 종료합니다. 메인 창의 X 버튼은 위젯 모드로 전환만 하고
            앱은 백그라운드로 계속 실행됩니다.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => {
                if (quitConfirm) {
                  quitApp().catch(() => undefined);
                } else {
                  setQuitConfirm(true);
                }
              }}
              style={{
                background: quitConfirm
                  ? "rgba(220,38,38,1)"
                  : "rgba(239,68,68,0.85)",
                color: "white",
                border: "none",
                fontWeight: quitConfirm ? 700 : 400,
              }}
            >
              {quitConfirm ? "다시 클릭하면 종료" : "앱 종료"}
            </button>
          </div>
        </>
      )}

      {!platform.features.multiWindow && (
        <>
          <h2 style={{ margin: "1rem 0 0" }}>데스크톱 앱</h2>
          <div className="setting-row">
            <div className="desc">
              백그라운드 모니터링·트레이 알림·플로팅 위젯은 데스크톱 앱에서만
              가능합니다. 같은 카메라 검출 그대로, 탭이 닫혀도 동작합니다.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
