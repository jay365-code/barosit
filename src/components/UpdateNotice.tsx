// 새 버전 사용 가능 시 최상단 프리미엄 가로 배너. 메인 윈도우 안에서만 표시 (모드 무관).
// 다운로드 중에는 가로 게이지 바 표시. 완료 시 자동 relaunch 되므로 별도 처리 없음.

import { useTranslation } from "react-i18next";
import type { UpdaterState } from "../updater";

interface Props {
  state: UpdaterState;
  style?: React.CSSProperties;
}

export function UpdateNotice({ state, style }: Props) {
  const { t } = useTranslation("app");
  const {
    available,
    progress,
    error,
    info,
    applyUpdate,
    snooze,
    dismissError,
    dismissInfo,
  } = state;

  if (error) {
    return (
      <div className="b-update-notice b-update-error" style={style}>
        <div className="b-update-content">
          <div className="b-update-title">{t("update.errorTitle")}</div>
          <div className="b-update-body" title={error}>{error}</div>
        </div>
        <button
          className="b-btn b-btn-quiet"
          style={{ height: "30px", fontSize: "12px", padding: "0 10px" }}
          onClick={dismissError}
        >
          {t("update.close")}
        </button>
      </div>
    );
  }

  if (info) {
    return (
      <div className="b-update-notice b-update-info" style={style}>
        <div className="b-update-content">
          <div className="b-update-title">{t("update.infoTitle")}</div>
          <div className="b-update-body" title={info}>{info}</div>
        </div>
        <button
          className="b-btn b-btn-quiet"
          style={{ height: "30px", fontSize: "12px", padding: "0 10px" }}
          onClick={dismissInfo}
        >
          {t("update.close")}
        </button>
      </div>
    );
  }


  if (!available) return null;

  const downloading = progress !== null;
  const pct = progress !== null ? Math.round(progress * 100) : 0;

  return (
    <div className="b-update-notice" style={style}>
      {downloading ? (
        <div className="b-update-progress-container">
          <div className="b-update-progress-label">
            {pct < 100
              ? t("update.downloadingMsg", { version: available.version, pct })
              : t("update.installingMsg", { version: available.version })}
          </div>
          <div className="b-update-progress">
            <div
              className="b-update-progress-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="b-update-content">
            <div className="b-update-title">{t("update.available", { version: available.version })}</div>
            {available.body && (
              <div className="b-update-body" title={available.body}>— {available.body}</div>
            )}
          </div>
          <div className="b-update-actions">
            <button
              className="b-btn b-btn-quiet"
              style={{ height: "30px", fontSize: "12px", padding: "0 10px" }}
              onClick={snooze}
            >
              {t("update.later")}
            </button>
            <button
              className="b-btn b-btn-primary"
              style={{ height: "30px", fontSize: "12px", padding: "0 12px" }}
              onClick={applyUpdate}
            >
              {t("update.updateRestart")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

