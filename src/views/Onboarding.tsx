import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";
import { platform } from "../platform";
import type { LegalDocKind } from "../components/LegalDocument";

interface Props {
  onFinish: () => void;
  onSkip: () => void;
  onShowLegal: (kind: LegalDocKind) => void;
}

const STEPS: Array<{ icon: IconName; id: "watch" | "detect" | "adjust" }> = [
  { icon: "camera", id: "watch" },
  { icon: "target", id: "detect" },
  { icon: "sparkle", id: "adjust" },
];

const PRIVACY_POINTS = ["noSave", "localOnly", "cameraOff"] as const;

export function Onboarding({ onFinish, onSkip, onShowLegal }: Props) {
  const { t } = useTranslation("onboarding");
  const [page, setPage] = useState<1 | 2 | 3>(1);

  const next = () => {
    if (page < 3) setPage((p) => (p + 1) as 1 | 2 | 3);
    else {
      platform.requestPermissionsForMonitoring().catch(() => undefined);
      onFinish();
    }
  };
  const back = () => setPage((p) => (Math.max(1, p - 1) as 1 | 2 | 3));

  return (
    <div className="b-overlay">
      <div
        className="b-modal"
        style={{ maxWidth: 540, padding: 40, textAlign: "center" }}
      >
        {page === 1 && (
          <>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
              <Logo size={72} stroke="var(--b-sig)" strokeWidth={1.2} />
            </div>
            <h1
              style={{
                fontSize: 36,
                fontWeight: 700,
                lineHeight: 1.25,
                letterSpacing: "-0.028em",
                marginTop: 0,
                marginBottom: 14,
              }}
            >
              {t("hero.title1")}
              <br />
              {t("hero.title2")}
            </h1>
            <p
              style={{
                fontSize: 15,
                color: "var(--b-fg-2)",
                lineHeight: 1.55,
                margin: "0 auto 32px",
                maxWidth: 400,
              }}
            >
              {t("hero.sub1")}
              <br />
              {t("hero.sub2")}
            </p>
            <button
              className="b-btn b-btn-primary"
              onClick={next}
              style={{ height: 44, padding: "0 28px", fontSize: 14 }}
            >
              {t("start")} <Icon name="arrow-r" size={14} />
            </button>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 6 }}>
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  style={{
                    width: n === page ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    background: n === page ? "var(--b-sig)" : "var(--b-line-2)",
                    transition: "width .2s",
                  }}
                />
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                className="b-btn b-btn-quiet"
                onClick={onSkip}
                style={{ fontSize: 12 }}
              >
                {t("skip")}
              </button>
            </div>
          </>
        )}
        {page === 2 && (
          <>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--b-sig)",
                letterSpacing: "0.08em",
                marginBottom: 12,
              }}
            >
              {t("howItWorks")}
            </div>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "-0.022em",
                marginBottom: 28,
                marginTop: 0,
              }}
            >
              {t("rememberThree")}
            </h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                textAlign: "left",
              }}
            >
              {STEPS.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 14,
                    alignItems: "flex-start",
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "var(--b-surface-2)",
                    border: "1px solid var(--b-line)",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "var(--b-sig-soft)",
                      color: "var(--b-sig-deep)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={s.icon} size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
                      {t(`steps.${s.id}.t`)}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--b-fg-3)",
                        lineHeight: 1.5,
                      }}
                    >
                      {t(`steps.${s.id}.d`)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 28,
              }}
            >
              <button className="b-btn b-btn-quiet" onClick={back}>
                <Icon name="chev-l" size={13} />
                {t("back")}
              </button>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    style={{
                      width: n === page ? 20 : 6,
                      height: 6,
                      borderRadius: 3,
                      background: n === page ? "var(--b-sig)" : "var(--b-line-2)",
                    }}
                  />
                ))}
              </div>
              <button className="b-btn b-btn-primary" onClick={next}>
                {t("next")} <Icon name="chev-r" size={13} />
              </button>
            </div>
          </>
        )}
        {page === 3 && (
          <>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 20,
                margin: "0 auto 20px",
                background: "var(--b-sig-soft)",
                color: "var(--b-sig-deep)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="shield" size={36} />
            </div>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "-0.022em",
                marginBottom: 12,
                marginTop: 0,
              }}
            >
              {t("privacy.title1")}
              <br />
              {t("privacy.title2")}
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--b-fg-2)",
                lineHeight: 1.55,
                marginBottom: 24,
                margin: "0 auto 24px",
                maxWidth: 420,
              }}
            >
              {t("privacy.body")}
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                textAlign: "left",
                marginBottom: 28,
              }}
            >
              {PRIVACY_POINTS.map((pid) => (
                <div
                  key={pid}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    color: "var(--b-fg-2)",
                  }}
                >
                  <Icon
                    name="check"
                    size={15}
                    style={{ color: "var(--b-sig)", flexShrink: 0 }}
                  />
                  {t(`privacyPoints.${pid}`)}
                </div>
              ))}
            </div>
            <button
              className="b-btn b-btn-primary"
              onClick={next}
              style={{ height: 44, padding: "0 24px", fontSize: 14 }}
            >
              <Icon name="camera" size={14} />
              {t("allowCamera")}
            </button>
            <div style={{ marginTop: 14, fontSize: 11, color: "var(--b-fg-4)" }}>
              {t("changeLater")}
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: 11,
                color: "var(--b-fg-4)",
                display: "flex",
                justifyContent: "center",
                gap: 12,
              }}
            >
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
                {t("privacyPolicy")}
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
                {t("terms")}
              </button>
            </div>
            <div
              style={{
                marginTop: 20,
                display: "flex",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  style={{
                    width: n === page ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    background:
                      n === page ? "var(--b-sig)" : "var(--b-line-2)",
                    transition: "width .2s",
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
