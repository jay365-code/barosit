import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCamera } from "../hooks/useCamera";
import { usePoseLoop } from "../hooks/usePoseLoop";
import { LandmarkOverlay } from "../components/LandmarkOverlay";
import {
  CalibrationCollector,
  StabilityWindow,
  checkCalibrationFrame,
  saveBaseline,
  type CalibrationCheck,
} from "../pose/calibration";
import type {
  CalibrationBaseline,
  DetectionFrame,
  Landmarks,
  Landmark,
} from "../pose/types";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { platform } from "../platform";
import { PostureFigure } from "../components/PostureFigure";
import { reportError } from "../lib/errorReporting";

interface Props {
  onComplete: (baseline: CalibrationBaseline) => void;
  onCancel?: () => void;
}

const CALIBRATION_DURATION_SECS = 5;
const MIN_OK_RATIO = 0.65;

const CHECK_KEYS: (keyof CalibrationCheck)[] = [
  "bodyVisible",
  "headNotTiltedDown",
  "headUpright",
  "noChinRest",
  "stable",
];

export function CalibrationView({ onComplete, onCancel }: Props) {
  const { t } = useTranslation(["calibration", "common"]);
  const { videoRef, ready: cameraReady, error: cameraError } = useCamera();
  const [landmarks, setLandmarks] = useState<Landmarks | null>(null);
  const [faceLandmarks, setFaceLandmarks] = useState<Landmark[] | null>(null);
  const [videoAspect, setVideoAspect] = useState<number>(4 / 3);
  const [phase, setPhase] = useState<
    "idle" | "capturing" | "done" | "rejected" | "error"
  >("idle");
  const [secondsLeft, setSecondsLeft] = useState(CALIBRATION_DURATION_SECS);
  const [liveCheck, setLiveCheck] = useState<CalibrationCheck | null>(null);
  const [okRatio, setOkRatio] = useState(0);
  // UX-1: 실패 시 "무엇이 부족했는지" 안내용 — rejected 시 부족 항목, error 시 사유
  const [weakChecks, setWeakChecks] = useState<(keyof CalibrationCheck)[]>([]);
  const collectorRef = useRef(new CalibrationCollector());
  const liveStabilityRef = useRef(new StabilityWindow());

  const {
    ready: detectorReady,
    error: detectorError,
    retry: detectorRetry,
  } = usePoseLoop({
    videoRef,
    enabled: cameraReady,
    fps: 10,
    onFrame: (frame: DetectionFrame) => {
      setLandmarks(frame.pose);
      setFaceLandmarks(frame.face?.landmarks || null);
      setLiveCheck(checkCalibrationFrame(frame, liveStabilityRef.current));
      if (phase === "capturing") {
        collectorRef.current.pushFrame(frame);
        setOkRatio(collectorRef.current.okRatio());
      }
    },
  });

  useEffect(() => {
    if (phase !== "capturing") return;
    if (secondsLeft <= 0) {
      const ratio = collectorRef.current.okRatio();
      if (ratio < MIN_OK_RATIO) {
        // UX-1: 어떤 적합성 항목이 부족했는지 캡처해 안내
        setWeakChecks(collectorRef.current.weakestChecks());
        setPhase("rejected");
        return;
      }
      try {
        const baseline = collectorRef.current.build();
        saveBaseline(baseline);
        setPhase("done");
        onComplete(baseline);
      } catch (e) {
        // UX-1: 조용히 idle 로 가지 않고 사유를 표시 + OPS-1 관측 리포트
        console.error(e);
        reportError(e, "react", { stack: e instanceof Error ? e.stack : undefined });
        setPhase("error");
      }
      return;
    }
    const id = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [phase, secondsLeft, onComplete]);

  const start = () => {
    collectorRef.current.reset();
    setSecondsLeft(CALIBRATION_DURATION_SECS);
    setOkRatio(0);
    setPhase("capturing");
  };

  const retry = () => {
    collectorRef.current.reset();
    liveStabilityRef.current.reset();
    setSecondsLeft(CALIBRATION_DURATION_SECS);
    setOkRatio(0);
    setWeakChecks([]);
    setPhase("idle");
  };

  const allOk = liveCheck?.allOk ?? false;
  const capturing = phase === "capturing";

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
        background: "var(--b-bg)",
      }}
    >
      <div
        style={{
          width: 560,
          maxWidth: "100%",
          background: "var(--b-surface)",
          borderRadius: 20,
          padding: 36,
          border: "1px solid var(--b-line)",
          boxShadow: "var(--b-shadow-modal)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={28} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--b-sig)",
                letterSpacing: "0.08em",
              }}
            >
              {t("calibration:title")}
            </span>
          </div>
          {!platform.features.multiWindow && onCancel && (
            <button
              onClick={onCancel}
              className="b-btn b-btn-ghost"
              style={{
                height: 30,
                padding: "0 12px",
                fontSize: 12,
                border: "none",
                cursor: "pointer",
                background: "none",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {t("calibration:back")}
            </button>
          )}
        </div>

        {phase === "error" ? (
          <>
            <h2
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "-0.022em",
                margin: 0,
                marginBottom: 8,
              }}
            >
              {t("calibration:error.title")}
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--b-fg-3)",
                margin: 0,
                marginBottom: 20,
                lineHeight: 1.55,
              }}
            >
              {t("calibration:error.body")}
            </p>
            <button
              className="b-btn b-btn-primary"
              onClick={retry}
              style={{ width: "100%", justifyContent: "center", height: 44 }}
            >
              <Icon name="play" size={14} />
              {t("calibration:retry")}
            </button>
          </>
        ) : phase === "rejected" ? (
          <>
            <h2
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "-0.022em",
                margin: 0,
                marginBottom: 8,
              }}
            >
              {t("calibration:rejected.title")}
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--b-fg-3)",
                margin: 0,
                marginBottom: weakChecks.length > 0 ? 12 : 20,
                lineHeight: 1.55,
              }}
            >
              {t("calibration:rejected.body", {
                secs: CALIBRATION_DURATION_SECS,
                pct: Math.round(okRatio * 100),
              })}
            </p>
            {weakChecks.length > 0 && (
              <div
                style={{
                  textAlign: "left",
                  background: "var(--b-surface-2)",
                  border: "1px solid var(--b-line)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 20,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--b-fg-2)", marginBottom: 8 }}>
                  {t("calibration:rejected.fixTitle")}
                </div>
                {weakChecks.slice(0, 3).map((k) => (
                  <div
                    key={k}
                    style={{ fontSize: 12.5, color: "var(--b-fg-2)", lineHeight: 1.5, display: "flex", gap: 6 }}
                  >
                    <span style={{ flexShrink: 0 }}>•</span>
                    <span>{t(`calibration:checkHint.${k}`)}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              className="b-btn b-btn-primary"
              onClick={retry}
              style={{ width: "100%", justifyContent: "center", height: 44 }}
            >
              <Icon name="play" size={14} />
              {t("calibration:retry")}
            </button>
          </>
        ) : (
          <>
            <h2
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "-0.022em",
                margin: 0,
                marginBottom: 6,
                lineHeight: 1.3,
              }}
            >
              {capturing ? (
                <>{t("calibration:holdPosture")}</>
              ) : (
                <>
                  {t("calibration:sitNaturally1")}
                  <br />
                  {t("calibration:sitNaturally2")}
                </>
              )}
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--b-fg-3)",
                margin: 0,
                marginBottom: 20,
              }}
            >
              {capturing
                ? t("calibration:okFrames", { pct: Math.round(okRatio * 100) })
                : t("calibration:holdHint", { secs: CALIBRATION_DURATION_SECS })}
            </p>

            {/* Camera preview */}
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: videoAspect,
                borderRadius: 14,
                background: "#0a0a0a",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <video
                ref={videoRef}
                muted
                playsInline
                onLoadedMetadata={(e) => {
                  const video = e.currentTarget;
                  if (video.videoWidth && video.videoHeight) {
                    setVideoAspect(video.videoWidth / video.videoHeight);
                  }
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: "scaleX(-1)",
                  zIndex: 1,
                }}
              />
              <LandmarkOverlay landmarks={landmarks} faceLandmarks={faceLandmarks} />

              {/* Breathing ring overlay */}
              {capturing && (
                <div
                  style={{
                    position: "absolute",
                    width: 180,
                    height: 180,
                    borderRadius: "50%",
                    border: "2px solid var(--b-sig)",
                    opacity: 0.45,
                    animation: "b-breath 2.2s ease-in-out infinite",
                    zIndex: 3,
                    pointerEvents: "none",
                  }}
                />
              )}

              {/* Placeholder figure when no detection */}
              {!landmarks && !cameraError && (
                <div
                  style={{
                    color: "#a8d4c4",
                    position: "relative",
                    zIndex: 2,
                  }}
                >
                  <PostureFigure state="good" accent="currentColor" size={140} />
                </div>
              )}

              {/* Countdown */}
              {capturing && (
                <>
                  <div
                    className="b-num"
                    style={{
                      position: "absolute",
                      bottom: 14,
                      right: 16,
                      fontSize: 44,
                      fontWeight: 800,
                      color: "#fff",
                      letterSpacing: "-0.04em",
                      lineHeight: 1,
                      zIndex: 4,
                    }}
                  >
                    {secondsLeft}
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      bottom: 24,
                      left: 16,
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#a8d4c4",
                      letterSpacing: "0.04em",
                      zIndex: 4,
                    }}
                  >
                    {t("calibration:measuring")}
                  </div>
                </>
              )}

              {/* Camera error */}
              {cameraError && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#eee",
                    fontSize: 13,
                    gap: 8,
                    padding: 20,
                    textAlign: "center",
                  }}
                >
                  <Icon name="camera-off" size={28} />
                  {t("calibration:cameraError")}
                  <span style={{ fontSize: 11, opacity: 0.7 }}>
                    {cameraError}
                  </span>
                </div>
              )}

              {/* Loading */}
              {!cameraReady && !cameraError && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#a8d4c4",
                    fontSize: 12,
                  }}
                >
                  {t("calibration:cameraConnecting")}
                </div>
              )}
            </div>

            {/* Checks */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                marginBottom: 22,
              }}
            >
              {CHECK_KEYS.map((key) => {
                const ok = liveCheck?.[key] ?? false;
                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 0",
                      fontSize: 13,
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: ok ? "var(--b-sig)" : "transparent",
                        border: "1.5px solid",
                        borderColor: ok ? "var(--b-sig)" : "var(--b-line-3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        transition: "all .2s ease",
                      }}
                    >
                      {ok && (
                        <Icon name="check" size={11} style={{ color: "#fff" }} />
                      )}
                    </div>
                    <span
                      style={{
                        color: ok ? "var(--b-fg-2)" : "var(--b-fg-3)",
                      }}
                    >
                      {t(`calibration:checks.${key}`)}
                    </span>
                    {!ok && !capturing && (
                      <span
                        style={{
                          marginLeft: "auto",
                          fontSize: 11,
                          color: "var(--b-fg-4)",
                          fontWeight: 500,
                        }}
                      >
                        {t("calibration:adjusting")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Detector loading / error */}
            {!detectorReady && cameraReady && !detectorError && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--b-fg-3)",
                  marginBottom: 16,
                  textAlign: "center",
                }}
              >
                {t("calibration:modelLoading")}
              </div>
            )}
            {detectorError && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "var(--b-bg-2, rgba(255,80,80,0.08))",
                  border: "1px solid rgba(255,80,80,0.4)",
                  color: "var(--b-fg-2)",
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                <span>{detectorError}</span>
                <button
                  className="b-btn b-btn-ghost"
                  onClick={detectorRetry}
                  style={{ height: 32, fontSize: 12 }}
                >
                  {t("calibration:retry")}
                </button>
              </div>
            )}

            {!capturing ? (
              <button
                className="b-btn b-btn-primary"
                onClick={start}
                disabled={!allOk}
                style={{
                  width: "100%",
                  justifyContent: "center",
                  height: 44,
                }}
              >
                <Icon name="play" size={14} />
                {allOk ? t("calibration:startMeasure") : t("calibration:needAll")}
              </button>
            ) : (
              <button
                className="b-btn b-btn-ghost"
                onClick={retry}
                style={{ width: "100%", justifyContent: "center" }}
              >
                <Icon name="x" size={13} />
                {t("common:cancel")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
