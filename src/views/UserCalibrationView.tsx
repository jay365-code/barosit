import { useEffect, useRef, useState } from "react";
import { useCamera } from "../hooks/useCamera";
import { usePoseLoop } from "../hooks/usePoseLoop";
import { LandmarkOverlay } from "../components/LandmarkOverlay";
import { Icon } from "../components/Icon";
import {
  normalizePose,
  getCameraAngle,
  loadCustomTemplates,
  computePoseDistance,
  STRETCH_WEIGHTS,
  type NormalizedPose,
  type StretchKind,
  type CameraAngle,
} from "../pose/stretchDetector";
import type { DetectionFrame, Landmarks, Landmark } from "../pose/types";

const STRETCH_LIST: { id: StretchKind; label: string; desc: string }[] = [
  { id: "overhead", label: "기지개", desc: "양팔을 머리 위로 쭉 뻗는 기지개 동작" },
  { id: "behind_head", label: "목 풀기", desc: "양손을 깍지 껴 머리 뒤에 대는 동작" },
  { id: "cross_body", label: "어깨 스트레치", desc: "한 팔을 반대편으로 교차하여 당기는 동작" },
  { id: "side", label: "사이드 굽힘", desc: "한 팔을 위로 올린 채 상체를 옆으로 굽히는 동작" },
  { id: "shoulder_shrug", label: "어깨 으쓱", desc: "머리는 두고 양 어깨만 귀 쪽으로 올리는 동작" },
  { id: "neck_side", label: "목 좌우 풀기", desc: "어깨는 평평하게 두고 고개만 옆으로 기울이는 동작" },
  { id: "forward_fold", label: "상체 앞 숙이기", desc: "앉은 상태에서 상체를 앞으로 숙이는 동작" },
];

const ANGLE_LABELS: Record<CameraAngle, string> = {
  front: "정면 (Center)",
  left: "좌측 측면 (Left 45°)",
  right: "우측 측면 (Right 45°)",
};

interface Props {
  onClose: () => void;
}

export function UserCalibrationView({ onClose }: Props) {
  const { videoRef, ready: cameraReady } = useCamera(true);
  const [selectedStretch, setSelectedStretch] = useState<StretchKind>("overhead");
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>("front");
  const [isManualAngle, setIsManualAngle] = useState(false);
  const [landmarks, setLandmarks] = useState<Landmarks | null>(null);
  const [faceLandmarks, setFaceLandmarks] = useState<Landmark[] | null>(null);
  
  const [capturing, setCapturing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<Record<string, any>>({});
  
  const [capturedTempPose, setCapturedTempPose] = useState<NormalizedPose | null>(null);
  const [reviewMode, setReviewMode] = useState(false);

  const [videoAspect, setVideoAspect] = useState<number>(4 / 3);

  const collectedFramesRef = useRef<NormalizedPose[]>([]);
  const CAPTURE_FRAMES_LIMIT = 20; // 2초간 20프레임 수집

  useEffect(() => {
    if (!isManualAngle) {
      setCameraAngle(getCameraAngle());
    }
    setCustomTemplates(loadCustomTemplates());
  }, [isManualAngle]);

  usePoseLoop({
    videoRef,
    enabled: cameraReady && !reviewMode, // Stop loop processing during review to lock skeleton representation
    fps: 10,
    onFrame: (frame: DetectionFrame) => {
      setLandmarks(frame.pose);
      setFaceLandmarks(frame.face?.landmarks || null);

      // 실시간 카메라 위치 자동 분석: 수동 모드가 아니고 캡처 중이 아닐 때, 현재 프레임의 얼굴 yaw 각도를 실시간 반영
      if (!isManualAngle && !capturing && frame.face) {
        const liveYawDeg = frame.face.yaw * (180 / Math.PI);
        let liveAngle: CameraAngle = "front";
        if (liveYawDeg > 12) liveAngle = "right";
        else if (liveYawDeg < -12) liveAngle = "left";
        setCameraAngle(liveAngle);
      }

      if (capturing && frame.pose) {
        const norm = normalizePose(frame.pose);
        if (norm) {
          collectedFramesRef.current.push(norm);
          const ratio = Math.min(100, Math.round((collectedFramesRef.current.length / CAPTURE_FRAMES_LIMIT) * 100));
          setProgress(ratio);
          
          if (collectedFramesRef.current.length >= CAPTURE_FRAMES_LIMIT) {
            setCapturing(false);
            buildTempPose();
          }
        }
      }
    },
  });

  const startCapture = () => {
    setSuccess(false);
    setReviewMode(false);
    setCapturedTempPose(null);
    collectedFramesRef.current = [];
    setProgress(0);
    setCapturing(true);
  };

  const buildTempPose = () => {
    const frames = collectedFramesRef.current;
    if (frames.length === 0) return;

    const indices = [0, 7, 8, 11, 12, 13, 14, 15, 16];
    const meanPose: NormalizedPose = {};

    for (const idx of indices) {
      let sx = 0, sy = 0, sz = 0, count = 0;
      for (const f of frames) {
        const pt = f[idx];
        if (pt) {
          sx += pt.x;
          sy += pt.y;
          sz += pt.z;
          count++;
        }
      }
      if (count > 0) {
        meanPose[idx] = {
          x: Number((sx / count).toFixed(4)),
          y: Number((sy / count).toFixed(4)),
          z: Number((sz / count).toFixed(4)),
        };
      }
    }
    setCapturedTempPose(meanPose);
    setReviewMode(true);
  };

  const commitTempPose = () => {
    if (!capturedTempPose) return;
    try {
      const currentTemplates = loadCustomTemplates();
      const key = `${selectedStretch}_${cameraAngle}`;
      currentTemplates[key] = {
        pose: capturedTempPose,
        capturedAt: Date.now(),
      };
      localStorage.setItem("barosit:custom_stretch_templates", JSON.stringify(currentTemplates));
      setCustomTemplates(currentTemplates);
      setReviewMode(false);
      setCapturedTempPose(null);
      setSuccess(true);
    } catch (e) {
      console.error("Failed to save custom stretch template:", e);
    }
  };

  const cancelTempPose = () => {
    setCapturedTempPose(null);
    setReviewMode(false);
    setSuccess(false);
  };

  const getComparison = () => {
    const key = `${selectedStretch}_${cameraAngle}`;
    const prevTemplate = customTemplates[key];
    if (!prevTemplate || !prevTemplate.pose || !capturedTempPose) {
      return {
        hasPrev: false,
        totalDiffPercent: 0,
        description: "",
        maxShiftJointName: "",
        maxShiftPercent: 0,
      };
    }

    const weights = STRETCH_WEIGHTS[selectedStretch] ?? {};
    const dist = computePoseDistance(capturedTempPose, prevTemplate.pose, weights);
    const totalDiffPercent = Math.round(dist * 100);

    let maxDist = 0;
    let maxIdx = -1;
    const JOINT_NAMES: Record<number, string> = {
      0: "머리 (코)",
      7: "왼쪽 귀",
      8: "오른쪽 귀",
      11: "왼쪽 어깨",
      12: "오른쪽 어깨",
      13: "왼쪽 팔꿈치",
      14: "오른쪽 팔꿈치",
      15: "왼쪽 손목",
      16: "오른쪽 손목",
    };

    for (const idxStr in prevTemplate.pose) {
      const idx = Number(idxStr);
      const p1 = capturedTempPose[idx];
      const p2 = prevTemplate.pose[idx];
      if (p1 && p2) {
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
        if (d > maxDist) {
          maxDist = d;
          maxIdx = idx;
        }
      }
    }

    const maxShiftJointName = maxIdx !== -1 ? (JOINT_NAMES[maxIdx] ?? "관절") : "";
    const maxShiftPercent = Math.round(maxDist * 100);

    let description = "이전 대비 미세한 자세 변화가 감지되었습니다. 더 편안한 각도로 미세 보정됩니다.";
    if (totalDiffPercent < 3) {
      description = "이전 보정값과 거의 완벽하게 동일한 자세입니다. 안정적으로 정밀 튜닝됩니다.";
    } else if (totalDiffPercent >= 12) {
      description = "넓고 시원한 새로운 가동 범위가 감지되었습니다. 확실한 맞춤형 개인화가 적용됩니다!";
    } else if (totalDiffPercent >= 7) {
      description = "가동 범위가 유의미하게 변화되었습니다. 몸의 현재 유연성에 맞춤 보정됩니다.";
    }

    return {
      hasPrev: true,
      totalDiffPercent,
      description,
      maxShiftJointName,
      maxShiftPercent,
    };
  };

  const handleResetStretch = (kind: StretchKind) => {
    if (!confirm(`이 스트레칭의 모든 각도 보정 값을 삭제하고 기본 감지 모드로 초기화할까요?`)) return;
    try {
      const currentTemplates = loadCustomTemplates();
      delete currentTemplates[`${kind}_front`];
      delete currentTemplates[`${kind}_left`];
      delete currentTemplates[`${kind}_right`];
      localStorage.setItem("barosit:custom_stretch_templates", JSON.stringify(currentTemplates));
      setCustomTemplates(currentTemplates);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetAll = () => {
    if (!confirm("정말 모든 스트레칭 보정 값을 초기화하고 기본 어드민 표준 데이터로 복원하시겠습니까?")) return;
    try {
      localStorage.removeItem("barosit:custom_stretch_templates");
      setCustomTemplates({});
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10, 10, 10, 0.75)",
        backdropFilter: "blur(12px)",
        color: "#fff",
      }}
    >
      <div
        style={{
          width: "90%",
          maxWidth: 900,
          background: "var(--b-surface)",
          borderRadius: 24,
          padding: 32,
          border: "1px solid var(--b-line)",
          boxShadow: "var(--b-shadow-modal)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "rgba(91, 140, 122, 0.15)",
                color: "var(--b-sig)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="target" size={16} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>나만의 스트레칭 가동범위 보정</h3>
              <p style={{ fontSize: 12, opacity: 0.5, margin: "2px 0 0" }}>
                내 몸의 유연성과 카메라 장착 각도에 맞춰 감지 정확도를 100%로 개인화합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              opacity: 0.6,
            }}
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* 바디 레이아웃 */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 28, alignItems: "start" }}>
          {/* 좌측: 카메라 프리뷰 및 캡처 버튼 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* 카메라 위치 배지 및 수동 설정 제어기 */}
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                background: "rgba(91, 140, 122, 0.08)",
                border: "1px solid rgba(91, 140, 122, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--b-sig)" }}>
                <Icon name="target" size={13} />
                <span>
                  카메라 위치: <strong>{ANGLE_LABELS[cameraAngle]}</strong>
                  {!isManualAngle && <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 6 }}>(자동 분석됨)</span>}
                </span>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, opacity: 0.5 }}>수동선정:</span>
                <select
                  value={isManualAngle ? cameraAngle : "auto"}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "auto") {
                      setIsManualAngle(false);
                    } else {
                      setIsManualAngle(true);
                      setCameraAngle(val as CameraAngle);
                    }
                  }}
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 11,
                    padding: "3px 6px",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <option value="auto">자동 분석 모드</option>
                  <option value="front">정면 (Center)</option>
                  <option value="left">좌측 45° (Left)</option>
                  <option value="right">우측 45° (Right)</option>
                </select>
              </div>
            </div>

            {/* 카메라 프리뷰 */}
            <div
              style={{
                position: "relative",
                height: 200, // Constrain height to fit modal actions cleanly on small screens
                aspectRatio: videoAspect,
                borderRadius: 16,
                background: "#0c0c0c",
                border: "1px solid var(--b-line)",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                alignSelf: "center",
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

              {capturing && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0, 0, 0, 0.5)",
                    zIndex: 3,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 800, color: "var(--b-sig)" }}>{progress}%</div>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>자세를 지그시 유지하고 기다려주세요...</div>
                </div>
              )}

              {/* 임시 캡처 완료 검토 화면 (Review Mode) */}
              {reviewMode && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0, 0, 0, 0.4)",
                    zIndex: 3,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    color: "#fff",
                    padding: 16,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      padding: "6px 12px",
                      borderRadius: 20,
                      background: "rgba(217, 167, 82, 0.15)",
                      border: "1px solid rgba(217, 167, 82, 0.3)",
                      color: "#d9a752",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    동작 임시 수집 완료 🔍
                  </div>
                  <p style={{ fontSize: 10, opacity: 0.9, margin: 0, lineHeight: 1.4 }}>
                    관절 랜드마크 상태를 확인하신 뒤,<br />
                    아래의 <strong>이 자세 저장하기</strong> 단추를 클릭해 주세요!
                  </p>
                </div>
              )}

              {success && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(10, 10, 10, 0.9)",
                    zIndex: 3,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 16,
                    color: "var(--b-sig)",
                    padding: 20,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: "rgba(91, 140, 122, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="check" size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>보정 값 저장 완료!</div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, lineHeight: 1.4 }}>
                      [{STRETCH_LIST.find((s) => s.id === selectedStretch)?.label}] 맞춤 데이터가<br />
                      로컬 저장소에 안전하게 기록되었습니다.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button
                      onClick={() => setSuccess(false)}
                      style={{
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: 8,
                        padding: "8px 14px",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"}
                    >
                      다른 동작 보정하기
                    </button>
                    <button
                      onClick={onClose}
                      style={{
                        background: "linear-gradient(135deg, var(--b-sig), #3c5e52)",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 16px",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "opacity 0.2s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                    >
                      보정 완료하고 복귀
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 이전 보정 대비 실시간 분석 및 비교 카드 */}
            {reviewMode && (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "rgba(91, 140, 122, 0.08)",
                  border: "1px solid rgba(91, 140, 122, 0.2)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--b-sig)", fontWeight: 700 }}>
                  <Icon name="target" size={13} />
                  <span>실시간 보정 분석 결과</span>
                </div>
                
                {(() => {
                  const comp = getComparison();
                  if (!comp.hasPrev) {
                    return (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.4, textAlign: "left" }}>
                        💡 <strong>최초 보정 등록</strong>: 이전 맞춤 보정 기록이 없습니다. 현재 자세를 나만의 스트레칭 감지 기준으로 신규 등록합니다!
                      </div>
                    );
                  }
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, opacity: 0.6 }}>이전 보정값 대비 자세 변화도</span>
                        <span style={{ fontSize: 13, color: "var(--b-sig)", fontWeight: 800 }}>
                          {comp.totalDiffPercent}% 변화 감지
                        </span>
                      </div>
                      
                      {/* 가동범위 변화량 시각화 바 */}
                      <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.min(100, comp.totalDiffPercent * 5)}%`,
                            background: "var(--b-sig)",
                            borderRadius: 2,
                          }}
                        />
                      </div>
                      
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", lineHeight: 1.4 }}>
                        🎯 {comp.description}
                      </div>
                      {comp.maxShiftJointName && (
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                          * 가장 가동 범위가 커진 부위: <strong>{comp.maxShiftJointName}</strong> (약 {comp.maxShiftPercent}% 변위)
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 캡처 및 저장 실행 단추 제어 영역 */}
            {reviewMode ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 10 }}>
                <button
                  onClick={cancelTempPose}
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: 12,
                    padding: "12px 0",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                >
                  🔄 다시 촬영
                </button>
                <button
                  onClick={commitTempPose}
                  style={{
                    background: "linear-gradient(135deg, var(--b-sig), #3c5e52)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    padding: "12px 0",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    transition: "opacity 0.2s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                >
                  💾 이 자세 저장하기
                </button>
              </div>
            ) : (
              <button
                onClick={startCapture}
                disabled={capturing || !cameraReady}
                style={{
                  background: "linear-gradient(135deg, var(--b-sig), #3c5e52)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  padding: "12px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  whiteSpace: "nowrap",
                  transition: "opacity 0.2s",
                  opacity: capturing || !cameraReady ? 0.6 : 1,
                }}
              >
                <Icon name="target" size={15} />
                {capturing ? "분석 중..." : "동작 캡처 (2초)"}
              </button>
            )}
          </div>

          {/* 우측: 스트레칭 리스트 및 보정 현황 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--b-fg-2)" }}>보정할 스트레칭 선택</div>
            
            <div
              className="b-scroll"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: 280,
                overflowY: "auto",
                paddingRight: 6,
              }}
            >
              {STRETCH_LIST.map((item) => {
                const isCustomized =
                  customTemplates[`${item.id}_front`] ||
                  customTemplates[`${item.id}_left`] ||
                  customTemplates[`${item.id}_right`];
                  
                return (
                  <div
                    key={item.id}
                    onClick={() => !capturing && setSelectedStretch(item.id)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: selectedStretch === item.id ? "rgba(255,255,255,0.03)" : "transparent",
                      border: selectedStretch === item.id ? "1px solid var(--b-sig)" : "1px solid rgba(255, 255, 255, 0.05)",
                      cursor: capturing ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: selectedStretch === item.id ? "var(--b-sig)" : "var(--b-fg-1)" }}>
                        {item.label}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--b-fg-4)" }}>{item.desc}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isCustomized ? (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: "rgba(91, 140, 122, 0.12)",
                            color: "var(--b-sig)",
                            padding: "2px 6px",
                            borderRadius: 6,
                          }}
                        >
                          보정됨
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: "var(--b-fg-4)", opacity: 0.5 }}>기본값</span>
                      )}

                      {isCustomized && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResetStretch(item.id);
                          }}
                          title="기본값으로 복원"
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--b-warn)",
                            cursor: "pointer",
                            opacity: 0.6,
                            padding: 2,
                          }}
                        >
                          <Icon name="x" size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 일괄 초기화 버튼 */}
            <button
              onClick={handleResetAll}
              disabled={Object.keys(customTemplates).length === 0}
              style={{
                background: "rgba(220, 38, 38, 0.08)",
                color: "var(--b-warn)",
                border: "1px solid rgba(220, 38, 38, 0.2)",
                borderRadius: 12,
                padding: "10px 0",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                marginTop: 6,
                transition: "opacity 0.2s",
                opacity: Object.keys(customTemplates).length === 0 ? 0.5 : 1,
              }}
            >
              🔄 모든 스트레칭 보정 초기화 (기본값 복원)
            </button>

            {/* 최종 저장 및 종료 버튼 */}
            <button
              onClick={onClose}
              style={{
                background: "linear-gradient(135deg, var(--b-sig), #3c5e52)",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "12px 0",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "opacity 0.2s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >
              <Icon name="check" size={15} />
              💾 모든 보정 설정 완료하고 창 닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
