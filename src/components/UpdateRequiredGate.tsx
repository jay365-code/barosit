// 강제 업데이트 차단 화면 (1차). blocked 일 때 앱 전체를 덮는다.
// 경보성 문구 없이 담백하게: "업데이트해야 계속 이용 가능" + [지금 업데이트].
// 자동 업데이트가 안 되는 사용자를 가두지 않도록 수동 다운로드 링크를 항상 제공.

import { useTranslation } from "react-i18next";
import type { UpdaterState } from "../updater";
import { platform } from "../platform";

const RELEASES_URL = "https://github.com/jay365-code/barosit/releases/latest";

interface Props {
  requiredVersion: string | null;
  updater: UpdaterState;
}

export function UpdateRequiredGate({ requiredVersion, updater }: Props) {
  const { t } = useTranslation("app");
  const { progress, error, applyUpdate } = updater;
  const busy = progress !== null;
  const pct = Math.round((progress ?? 0) * 100);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "var(--b-bg, #0f1115)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 40 }}>⬆️</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--b-fg, #fff)" }}>
          {t("updateRequired.title")}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--b-fg-2, #b8bec9)" }}>
          {t("updateRequired.body")}
        </div>
        {requiredVersion && (
          <div style={{ fontSize: 12, color: "var(--b-fg-3, #7a8494)" }}>
            {t("updateRequired.version", { version: requiredVersion })}
          </div>
        )}

        {busy ? (
          <div style={{ width: "100%", marginTop: 4 }}>
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: "var(--b-bg-3, #23262d)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: "var(--b-sig, #2d8f7e)",
                  transition: "width 0.2s",
                }}
              />
            </div>
            <div style={{ fontSize: 12, marginTop: 8, color: "var(--b-fg-2, #b8bec9)" }}>
              {t("updateRequired.downloading", { pct })}
            </div>
          </div>
        ) : (
          <button
            onClick={() => void applyUpdate()}
            style={{
              marginTop: 4,
              padding: "12px 28px",
              fontSize: 15,
              fontWeight: 700,
              color: "#fff",
              background: "var(--b-sig, #2d8f7e)",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            {t("updateRequired.cta")}
          </button>
        )}

        {error && (
          <div style={{ fontSize: 12, color: "var(--b-danger, #e06c6c)", maxWidth: 360 }}>
            {error}
          </div>
        )}

        <button
          onClick={() => void platform.openBrowser(RELEASES_URL)}
          style={{
            marginTop: 4,
            background: "none",
            border: "none",
            color: "var(--b-fg-3, #7a8494)",
            fontSize: 12,
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          {t("updateRequired.manual")}
        </button>
      </div>
    </div>
  );
}
