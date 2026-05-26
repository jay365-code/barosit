import { useEffect, useRef, useState } from "react";
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

interface Props {
  onComplete: (baseline: CalibrationBaseline) => void;
  onCancel?: () => void;
}

const CALIBRATION_DURATION_SECS = 5;
const MIN_OK_RATIO = 0.65;

const CHECK_LABELS: { key: keyof CalibrationCheck; label: string }[] = [
  { key: "bodyVisible", label: "전체 상반신이 보여요" },
  { key: "headNotTiltedDown", label: "고개를 들고 있어요" },
  { key: "headUpright", label: "머리가 좌우로 수평이에요" },
  { key: "noChinRest", label: "손을 책상 위에 두세요" },
  { key: "stable", label: "편안한 자세로 멈춰 있어요" },
];

export function CalibrationView({ onComplete, onCancel }: Props) {
  const { videoRef, ready: cameraReady, error: cameraError } = useCamera();
  const [landmarks, setLandmarks] = useState<Landmarks | null>(null);
  const [faceLandmarks, setFaceLandmarks] = useState<Landmark[] | null>(null);
  const [videoAspect, setVideoAspect] = useState<number>(4 / 3);
  const [phase, setPhase] = useState<
    "idle" | "capturing" | "done" | "rejected"
  >("idle");
  const [secondsLeft, setSecondsLeft] = useState(CALIBRATION_DURATION_SECS);
  const [liveCheck, setLiveCheck] = useState<CalibrationCheck | null>(null);
  const [okRatio, setOkRatio] = useState(0);
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
        setPhase("rejected");
        return;
      }
      try {
        const baseline = collectorRef.current.build();
        saveBaseline(baseline);
        setPhase("done");
        onComplete(baseline);
      } catch (e) {
        console.error(e);
        setPhase("idle");
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
              기준 자세 잡기
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
              돌아가기
            </button>
          )}
        </div>

        {phase === "rejected" ? (
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
              자세가 충분히 안정되지 않았어요
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
              5초 중 적합 프레임이 {Math.round(okRatio * 100)}%였어요 (65% 이상
              필요). 움직임을 줄이고 아래 항목을 모두 만족시킨 채 다시 시도해
              주세요.
            </p>
            <button
              className="b-btn b-btn-primary"
              onClick={retry}
              style={{ width: "100%", justifyContent: "center", height: 44 }}
            >
              <Icon name="play" size={14} />
              다시 시도
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
                <>바른 자세를 잠시 유지해주세요</>
              ) : (
                <>
                  평소 모니터를 볼 때처럼
                  <br />
                  편하게 앉아주세요
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
                ? `적합 프레임 ${Math.round(okRatio * 100)}%`
                : "5초만 그대로 — 이 자세를 기준으로 잡아드릴게요"}
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
                    측정 중
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
                  카메라를 켤 수 없어요
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
                  카메라 연결 중…
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
              {CHECK_LABELS.map(({ key, label }) => {
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
                      {label}
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
                        맞추는 중…
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
                자세 감지 모델 로딩 중…
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
                  다시 시도
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
                {allOk ? "기준 자세 측정 시작" : "모든 항목 충족 시 시작 가능"}
              </button>
            ) : (
              <button
                className="b-btn b-btn-ghost"
                onClick={retry}
                style={{ width: "100%", justifyContent: "center" }}
              >
                <Icon name="x" size={13} />
                취소
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
