import { useEffect, useRef, useState } from "react";
import { useCamera } from "../hooks/useCamera";
import { usePoseLoop } from "../hooks/usePoseLoop";
import { LandmarkOverlay } from "../components/LandmarkOverlay";
import { Icon } from "../components/Icon";
import {
  normalizePose,
  loadAdminTemplates,
  STRETCH_LABEL,
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
  { id: "shoulder_shrug", label: "어깨 으쓱", desc: "양 어깨를 귀 쪽으로 최대한 으쓱 올리는 동작" },
  { id: "neck_side", label: "목 좌우 풀기", desc: "어깨는 고정하고 고개만 옆으로 기울이는 동작" },
  { id: "forward_fold", label: "상체 앞 숙이기", desc: "앉은 상태에서 상체를 깊이 앞으로 숙이는 동작" },
];

const ANGLE_LIST: { id: CameraAngle; label: string }[] = [
  { id: "front", label: "정면 (Front)" },
  { id: "left", label: "좌측면 (Left 45°)" },
  { id: "right", label: "우측면 (Right 45°)" },
];

const ANGLE_LABELS: Record<CameraAngle, string> = {
  front: "정면",
  left: "좌측면",
  right: "우측면",
};

interface AdminVersion {
  versionId: string;
  comment: string;
  createdAt: number;
  templates: Record<string, { pose: NormalizedPose; capturedAt: number; comment?: string }>;
}

interface WizardState {
  active: boolean;
  angle: CameraAngle;
  stepIndex: number; // 0 to 6
  drafts: Record<string, NormalizedPose>;
  mode: "all" | "single"; // "all" = 정면->좌측->우측 순차 연결, "single" = 단일 각도만 진행
}

export function AdminTemplateView() {
  const { videoRef, ready: cameraReady } = useCamera(true);
  const [selectedStretch, setSelectedStretch] = useState<StretchKind>("overhead");
  const [selectedAngle, setSelectedAngle] = useState<CameraAngle>("front");
  const [landmarks, setLandmarks] = useState<Landmarks | null>(null);
  const [faceLandmarks, setFaceLandmarks] = useState<Landmark[] | null>(null);
  
  const [capturing, setCapturing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [capturedData, setCapturedData] = useState<NormalizedPose | null>(null);

  // 개별 캡처 시 입력할 코멘트
  const [singleComment, setSingleComment] = useState("");

  // 보정 위저드 상태
  const [wizard, setWizard] = useState<WizardState>({
    active: false,
    angle: "front",
    stepIndex: 0,
    drafts: {},
    mode: "all",
  });
  const [wizardComment, setWizardComment] = useState("");

  // 로컬 스토리지 보정 데이터 및 버전 관리 상태
  const [adminTemplates, setAdminTemplates] = useState<Record<string, any>>({});
  const [versions, setVersions] = useState<AdminVersion[]>([]);
  const [newComment, setNewComment] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const collectedFramesRef = useRef<NormalizedPose[]>([]);
  const CAPTURE_FRAMES_LIMIT = 20; // 2초간 20프레임 수집

  const [videoAspect, setVideoAspect] = useState<number>(4 / 3);

  // 위저드나 개별 모드에 따른 현재 타깃 정의
  const currentActiveStretch = wizard.active ? STRETCH_LIST[wizard.stepIndex]?.id : selectedStretch;

  // 초기 상태 로드
  useEffect(() => {
    loadLocalData();
  }, []);

  const loadLocalData = () => {
    setAdminTemplates(loadAdminTemplates());
    try {
      const rawVersions = localStorage.getItem("barosit:admin_template_versions");
      if (rawVersions) {
        setVersions(JSON.parse(rawVersions));
      } else {
        setVersions([]);
      }
    } catch (e) {
      console.error("Failed to load admin template versions", e);
    }
  };

  usePoseLoop({
    videoRef,
    enabled: cameraReady,
    fps: 10,
    onFrame: (frame: DetectionFrame) => {
      setLandmarks(frame.pose);
      setFaceLandmarks(frame.face?.landmarks || null);
      if (capturing && frame.pose) {
        const norm = normalizePose(frame.pose);
        if (norm) {
          collectedFramesRef.current.push(norm);
          const ratio = Math.min(100, Math.round((collectedFramesRef.current.length / CAPTURE_FRAMES_LIMIT) * 100));
          setProgress(ratio);
          
          if (collectedFramesRef.current.length >= CAPTURE_FRAMES_LIMIT) {
            setCapturing(false);
            buildTemplate();
          }
        }
      }
    },
  });

  const startCapture = () => {
    collectedFramesRef.current = [];
    setProgress(0);
    setCapturedData(null);
    setCapturing(true);
  };

  const buildTemplate = () => {
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

    setCapturedData(meanPose);
  };

  // 개별 수동 적용하기 (Single Apply)
  const handleApply = () => {
    if (!capturedData) return;
    try {
      const updated = { ...adminTemplates };
      const key = `${selectedStretch}_${selectedAngle}`;
      updated[key] = {
        pose: capturedData,
        capturedAt: Date.now(),
        comment: singleComment.trim() || "개별 수동 보정",
      };
      localStorage.setItem("barosit:admin_templates", JSON.stringify(updated));
      setAdminTemplates(updated);
      setCapturedData(null);
      setSingleComment("");
      triggerSuccess("선택하신 동작의 표준 템플릿이 즉시 보정 반영되었습니다!");
    } catch (e) {
      console.error(e);
      alert("적용 도중 에러가 발생했습니다.");
    }
  };

  // 특정 항목 삭제 (Delete / Revert to code default)
  const handleDeleteItem = (key: string) => {
    const label = getTemplateLabel(key);
    if (!confirm(`'${label}' 표준 보정을 삭제하고 원래의 소스코드 기본값으로 복원할까요?`)) return;
    try {
      const updated = { ...adminTemplates };
      delete updated[key];
      localStorage.setItem("barosit:admin_templates", JSON.stringify(updated));
      setAdminTemplates(updated);
      triggerSuccess("해당 동작의 표준 보정이 안전하게 삭제되고 기본값으로 회복되었습니다.");
    } catch (e) {
      console.error(e);
    }
  };

  // 버전 저장 (Snapshot Save)
  const handleSaveVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) {
      alert("스냅샷 버전을 식별할 코멘트를 작성해 주세요.");
      return;
    }
    try {
      const date = new Date();
      const versionId = `v${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}_${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
      const newVersion: AdminVersion = {
        versionId,
        comment: newComment,
        createdAt: Date.now(),
        templates: { ...adminTemplates },
      };
      const updatedVersions = [newVersion, ...versions];
      localStorage.setItem("barosit:admin_template_versions", JSON.stringify(updatedVersions));
      setVersions(updatedVersions);
      setNewComment("");
      triggerSuccess(`버전 스냅샷 [${versionId}]이 코멘트와 함께 안전하게 아카이브되었습니다.`);
    } catch (e) {
      console.error(e);
    }
  };

  // 과거 버전 롤백 적용 (Apply past version)
  const handleRollbackVersion = (version: AdminVersion) => {
    if (!confirm(`스냅샷 [${version.versionId}] 상태로 모든 표준 템플릿을 전체 롤백(복원)하시겠습니까?\n\n코멘트: ${version.comment}`)) return;
    try {
      localStorage.setItem("barosit:admin_templates", JSON.stringify(version.templates));
      setAdminTemplates(version.templates);
      triggerSuccess(`[${version.versionId}] 상태로 전체 롤백 복원이 완료되었습니다!`);
    } catch (e) {
      console.error(e);
    }
  };

  // 과거 버전 삭제
  const handleDeleteVersion = (versionId: string) => {
    if (!confirm(`[${versionId}] 스냅샷 아카이브 기록을 아예 삭제하시겠습니까? (이력만 삭제되며 현재 적용된 템플릿에는 영향이 없습니다)`)) return;
    try {
      const updated = versions.filter((v) => v.versionId !== versionId);
      localStorage.setItem("barosit:admin_template_versions", JSON.stringify(updated));
      setVersions(updated);
      triggerSuccess("버전 아카이브 기록이 정상 삭제되었습니다.");
    } catch (e) {
      console.error(e);
    }
  };

  // 모든 어드민 보정 전체 초기화
  const handleResetAll = () => {
    if (!confirm("정말 모든 표준 어드민 보정 템플릿을 버리고 공장 초기 하드코딩 표준 템플릿 상태로 돌아가겠습니까?")) return;
    try {
      localStorage.removeItem("barosit:admin_templates");
      setAdminTemplates({});
      triggerSuccess("모든 실시간 보정 데이터가 사라지고 공장 출고 초기값으로 완벽히 리셋되었습니다.");
    } catch (e) {
      console.error(e);
    }
  };

  // 위저드 전용 컨트롤 핸들러들
  const handleWizardNext = () => {
    if (!capturedData) return;
    const key = `${currentActiveStretch}_${wizard.angle}`;
    const updatedDrafts = {
      ...wizard.drafts,
      [key]: capturedData,
    };
    
    setCapturedData(null);

    if (wizard.stepIndex < STRETCH_LIST.length - 1) {
      // 일반적인 다음 스트레칭 단계
      setWizard((prev) => ({
        ...prev,
        drafts: updatedDrafts,
        stepIndex: prev.stepIndex + 1,
      }));
    } else {
      // 마지막 단계 (index 6)
      if (wizard.mode === "all") {
        if (wizard.angle === "front") {
          setWizard((prev) => ({
            ...prev,
            drafts: updatedDrafts,
            angle: "left",
            stepIndex: 0,
          }));
          triggerSuccess("정면 보정이 완료되어 임시 저장되었습니다. 계속해서 좌측면 보정을 시작합니다!");
        } else if (wizard.angle === "left") {
          setWizard((prev) => ({
            ...prev,
            drafts: updatedDrafts,
            angle: "right",
            stepIndex: 0,
          }));
          triggerSuccess("좌측면 보정이 완료되어 임시 저장되었습니다. 계속해서 우측면 보정을 시작합니다!");
        } else {
          // 우측면까지 다 끝난 경우 -> 요약/완료 화면
          setWizard((prev) => ({
            ...prev,
            drafts: updatedDrafts,
            stepIndex: STRETCH_LIST.length,
          }));
        }
      } else {
        // 단일 각도 집중 보정 모드 -> 바로 해당 각도 요약 완료 화면으로
        setWizard((prev) => ({
          ...prev,
          drafts: updatedDrafts,
          stepIndex: STRETCH_LIST.length,
        }));
      }
    }
  };

  const handleWizardSkip = () => {
    setCapturedData(null);

    if (wizard.stepIndex < STRETCH_LIST.length - 1) {
      setWizard((prev) => ({
        ...prev,
        stepIndex: prev.stepIndex + 1,
      }));
    } else {
      // 마지막 단계 (index 6)
      if (wizard.mode === "all") {
        if (wizard.angle === "front") {
          setWizard((prev) => ({
            ...prev,
            angle: "left",
            stepIndex: 0,
          }));
          triggerSuccess("정면 단계를 마치고 좌측면 보정 단계를 시작합니다.");
        } else if (wizard.angle === "left") {
          setWizard((prev) => ({
            ...prev,
            angle: "right",
            stepIndex: 0,
          }));
          triggerSuccess("좌측면 단계를 마치고 우측면 보정 단계를 시작합니다.");
        } else {
          setWizard((prev) => ({
            ...prev,
            stepIndex: STRETCH_LIST.length,
          }));
        }
      } else {
        setWizard((prev) => ({
          ...prev,
          stepIndex: STRETCH_LIST.length,
        }));
      }
    }
  };

  const handleWizardPrev = () => {
    if (wizard.stepIndex > 0) {
      setWizard((prev) => {
        const nextIndex = prev.stepIndex - 1;
        const prevStretch = STRETCH_LIST[nextIndex]?.id;
        const key = `${prevStretch}_${prev.angle}`;
        const previousDraft = prev.drafts[key] || null;
        setCapturedData(previousDraft);
        return {
          ...prev,
          stepIndex: nextIndex,
        };
      });
    } else {
      // stepIndex === 0 일 때 이전 각도의 마지막 단계로 역방향 이동 (all 모드인 경우)
      if (wizard.mode === "all") {
        if (wizard.angle === "left") {
          setWizard((prev) => {
            const key = `${STRETCH_LIST[STRETCH_LIST.length - 1]?.id}_front`;
            const previousDraft = prev.drafts[key] || null;
            setCapturedData(previousDraft);
            return {
              ...prev,
              angle: "front",
              stepIndex: STRETCH_LIST.length - 1,
            };
          });
          triggerSuccess("이전 각도인 정면 보정의 마지막 단계로 이동합니다.");
        } else if (wizard.angle === "right") {
          setWizard((prev) => {
            const key = `${STRETCH_LIST[STRETCH_LIST.length - 1]?.id}_left`;
            const previousDraft = prev.drafts[key] || null;
            setCapturedData(previousDraft);
            return {
              ...prev,
              angle: "left",
              stepIndex: STRETCH_LIST.length - 1,
            };
          });
          triggerSuccess("이전 각도인 좌측면 보정의 마지막 단계로 이동합니다.");
        }
      }
    }
  };

  const handleWizardCancel = () => {
    if (confirm("정말 모든 위저드 보정 작업을 취소하고 나가시겠습니까? (임시 수집된 템플릿들은 반영되지 않고 유실됩니다)")) {
      setWizard({ active: false, angle: "front", stepIndex: 0, drafts: {}, mode: "all" });
      setCapturedData(null);
      setWizardComment("");
    }
  };

  const handleWizardGoToSummary = () => {
    let updatedDrafts = { ...wizard.drafts };
    if (capturedData) {
      const key = `${currentActiveStretch}_${wizard.angle}`;
      updatedDrafts[key] = capturedData;
    }
    
    setCapturedData(null);
    setWizard((prev) => ({
      ...prev,
      drafts: updatedDrafts,
      stepIndex: STRETCH_LIST.length,
    }));
  };

  const handleWizardComplete = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = { ...adminTemplates };
      const activeComment = wizardComment.trim() || "위저드 일괄 보정";
      
      for (const [key, pose] of Object.entries(wizard.drafts)) {
        updated[key] = {
          pose,
          capturedAt: Date.now(),
          comment: activeComment,
        };
      }
      
      localStorage.setItem("barosit:admin_templates", JSON.stringify(updated));
      setAdminTemplates(updated);

      // 자동으로 버전 스냅샷 생성 및 백업
      const date = new Date();
      const versionId = `v${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}_${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
      const newVersion: AdminVersion = {
        versionId,
        comment: activeComment + " (위저드 일괄 백업 스냅샷)",
        createdAt: Date.now(),
        templates: updated,
      };
      const updatedVersions = [newVersion, ...versions];
      localStorage.setItem("barosit:admin_template_versions", JSON.stringify(updatedVersions));
      setVersions(updatedVersions);

      // 위저드 종료 및 리셋
      setWizard({ active: false, angle: "front", stepIndex: 0, drafts: {}, mode: "all" });
      setWizardComment("");
      setCapturedData(null);
      triggerSuccess("보정 위저드가 성공적으로 완료되었으며 모든 설정이 스냅샷 저장 및 일괄 반영되었습니다!");
    } catch (err) {
      console.error(err);
      alert("위저드 데이터 저장에 실패했습니다.");
    }
  };

  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const getTemplateLabel = (key: string): string => {
    const [kind, angle] = key.split("_") as [StretchKind, CameraAngle];
    const stretchText = STRETCH_LABEL[kind] || kind;
    const angleText = ANGLE_LABELS[angle] || angle;
    return `${stretchText} (${angleText})`;
  };

  const formatDate = (ts?: number) => {
    if (!ts) return "날짜 없음";
    const date = new Date(ts);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="b-force-dark" style={{ display: "flex", flexDirection: "column", gap: 24, padding: 8 }}>
      {/* 최상단 알림 배너 */}
      {successMsg && (
        <div
          style={{
            position: "fixed",
            top: 24,
            right: 24,
            zIndex: 1100,
            background: "rgba(30, 48, 41, 0.9)",
            border: "1px solid var(--b-sig)",
            color: "#a8d4c4",
            padding: "16px 24px",
            borderRadius: 16,
            boxShadow: "var(--b-shadow-modal)",
            backdropFilter: "blur(12px)",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 10,
            animation: "slideDown 0.3s ease-out",
          }}
        >
          <Icon name="check" size={16} />
          {successMsg}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>📊 표준 가동범위 데이터 관리 시스템 (Admin)</h3>
          <p style={{ fontSize: 12, opacity: 0.5, margin: "4px 0 0" }}>
            어드민 전용: 코드 수정 없이 즉시 표준 감지선을 변경하고 버전 단위로 아카이브/롤백합니다.
          </p>
        </div>
        
        {/* 보정 위저드 시작 단추 (위저드가 비활성화되어 있을 때만 렌더링) */}
        {!wizard.active && (
          <button
            onClick={() => setWizard({ active: true, angle: selectedAngle, stepIndex: 0, drafts: {}, mode: "all" })}
            style={{
              background: "linear-gradient(135deg, #1b332b, #12221c)",
              border: "1px solid var(--b-sig)",
              color: "var(--b-sig)",
              borderRadius: 12,
              padding: "10px 20px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 0 10px rgba(91, 140, 122, 0.2)",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 0 15px rgba(91, 140, 122, 0.35)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 0 10px rgba(91, 140, 122, 0.2)";
            }}
          >
            <Icon name="sparkle" size={14} stroke={2.2} />
            🚀 7단계 일괄 보정 위저드 시작
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 32, alignItems: "start" }}>
        {/* 좌측: 카메라 피드, 설정 컨트롤러 및 버전 관리 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {/* 카메라 프리뷰 카드 */}
            <div
              style={{
                position: "relative",
                height: 190,
                aspectRatio: videoAspect,
                borderRadius: 16,
                background: "#0c0c0c",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
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
                    background: "rgba(0, 0, 0, 0.4)",
                    zIndex: 3,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    color: "#fff",
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 800, color: "var(--b-sig)" }}>{progress}%</div>
                  <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>동작 자세 고정...</div>
                </div>
              )}

              {!cameraReady && (
                <div style={{ color: "var(--b-sig)", zIndex: 2, fontSize: 12 }}>카메라 준비중...</div>
              )}
            </div>

            {/* 설정 컨트롤 영역 */}
            <div
              style={{
                flex: 1,
                padding: 16,
                background: "rgba(255, 255, 255, 0.01)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: 16,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                minHeight: 190,
                justifyContent: "center",
              }}
            >
              {wizard.active ? (
                // [위저드 활성화 시] 컨트롤러 영역은 상태 비활성화 안내문 표시
                <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--b-sig)", display: "flex", alignItems: "center", gap: 4 }}>
                    <Icon name="sparkle" size={10} /> 위저드 제어 가동 중
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--b-fg-1)" }}>
                    {ANGLE_LABELS[wizard.angle]} 보정 모드
                  </div>
                  <p style={{ fontSize: 11, color: "var(--b-fg-4)", lineHeight: 1.5, margin: 0 }}>
                    위저드가 동작을 순차적으로 안내하고 있습니다. 다른 스트레칭이나 각도를 선택하려면 우측에서 위저드를 먼저 종료해 주세요.
                  </p>
                </div>
              ) : (
                // [일반 개별 모드 시] 기존 제어기 완벽 지원
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--b-fg-2)" }}>스트레칭 종류 (개별 선택)</label>
                    <select
                      value={selectedStretch}
                      onChange={(e) => {
                        setSelectedStretch(e.target.value as StretchKind);
                        setCapturedData(null);
                      }}
                      disabled={capturing}
                      style={{
                        background: "#222",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        color: "#fff",
                        padding: "8px 12px",
                        borderRadius: 8,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {STRETCH_LIST.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--b-fg-2)" }}>카메라 각도 (개별 선택)</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {ANGLE_LIST.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            setSelectedAngle(item.id);
                            setCapturedData(null);
                          }}
                          disabled={capturing}
                          style={{
                            background: selectedAngle === item.id ? "rgba(91, 140, 122, 0.2)" : "rgba(255,255,255,0.02)",
                            border: selectedAngle === item.id ? "1px solid var(--b-sig)" : "1px solid rgba(255, 255, 255, 0.08)",
                            color: selectedAngle === item.id ? "var(--b-sig)" : "var(--b-fg-3)",
                            padding: "8px 0",
                            borderRadius: 8,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                        >
                          {ANGLE_LABELS[item.id]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={startCapture}
                    disabled={capturing || !cameraReady}
                    style={{
                      background: "linear-gradient(135deg, var(--b-sig), #3c5e52)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 16px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      whiteSpace: "nowrap",
                      opacity: capturing || !cameraReady ? 0.6 : 1,
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    <Icon name="target" size={13} />
                    {capturing ? "분석 중..." : "동작 캡처 (2초)"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 하단: 버전 관리 패널 */}
          <div
            style={{
              padding: 20,
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              borderRadius: 16,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--b-fg-2)" }}>📦 표준 템플릿 아카이브 및 버전 관리</span>
              <button
                onClick={handleResetAll}
                style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  color: "var(--b-warn)",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                공장 초기화
              </button>
            </div>

            {/* 새로운 버전 스냅샷 생성 폼 */}
            <form onSubmit={handleSaveVersion} style={{ display: "flex", gap: 10 }}>
              <input
                type="text"
                placeholder="현재 전체 표준 설정의 저장 코멘트 작성 (예: 어깨 감도 완화 버전)"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                style={{
                  flex: 1,
                  background: "#181818",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: "#fff",
                  fontSize: 12,
                }}
              />
              <button
                type="submit"
                style={{
                  background: "var(--b-sig)",
                  border: "none",
                  borderRadius: 8,
                  padding: "0 16px",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                스냅샷 저장
              </button>
            </form>

            {/* 저장된 스냅샷 아카이브 리스트 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto", paddingRight: 4 }}>
              {versions.length > 0 ? (
                versions.map((ver) => (
                  <div
                    key={ver.versionId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "var(--b-bg)",
                      border: "1px solid var(--b-line)",
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--b-sig)" }}>{ver.versionId}</span>
                      <span style={{ fontSize: 11, color: "var(--b-fg-3)" }}>{ver.comment}</span>
                      <span style={{ fontSize: 9, opacity: 0.3 }}>{new Date(ver.createdAt).toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleRollbackVersion(ver)}
                        style={{
                          background: "rgba(91, 140, 122, 0.15)",
                          border: "1px solid rgba(91, 140, 122, 0.3)",
                          color: "var(--b-sig-deep)",
                          borderRadius: 6,
                          padding: "6px 12px",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        ⏪ 이 버전 롤백 적용
                      </button>
                      <button
                        onClick={() => handleDeleteVersion(ver.versionId)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--b-fg-4)",
                          cursor: "pointer",
                          padding: 4,
                        }}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 11, opacity: 0.3, padding: "20px 0", textAlign: "center" }}>
                  저장된 백업 스냅샷 버전이 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 우측: 캡처 피드백 / 위저드 패널 & 보정 템플릿 목록 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          
          {wizard.active ? (
            // ==================== [위저드 활성화 모드] ====================
            <div
              style={{
                padding: 24,
                borderRadius: 16,
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--b-sig)",
                boxShadow: "0 0 15px rgba(91, 140, 122, 0.15)",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                minHeight: 250,
                textAlign: "left",
                position: "relative",
              }}
            >
              {wizard.stepIndex < STRETCH_LIST.length ? (
                // 1단계~7단계 단계별 캡처
                <>
                  {/* 카메라 위치 선택 탭 바 */}
                  <div
                    style={{
                      display: "flex",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: 10,
                      padding: 3,
                      gap: 4,
                      width: "100%",
                    }}
                  >
                    {ANGLE_LIST.map((item) => {
                      const isActive = wizard.angle === item.id;
                      const count = STRETCH_LIST.filter((s) => !!wizard.drafts[`${s.id}_${item.id}`]).length;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setWizard((prev) => ({
                              ...prev,
                              angle: item.id,
                              stepIndex: 0,
                              mode: "single", // 탭 클릭 시 단일 집중 보정 모드로 자동 전환
                            }));
                            setCapturedData(null);
                            triggerSuccess(`[${ANGLE_LABELS[item.id]}] 단일 집중 보정 모드로 전환되었습니다.`);
                          }}
                          style={{
                            flex: 1,
                            background: isActive ? "rgba(91, 140, 122, 0.18)" : "transparent",
                            border: isActive ? "1px solid var(--b-sig)" : "1px solid transparent",
                            color: isActive ? "var(--b-sig)" : "var(--b-fg-3)",
                            borderRadius: 8,
                            padding: "6px 0",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                            transition: "all 0.2s ease-in-out",
                          }}
                        >
                          {isActive && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--b-sig)" }} />}
                          {ANGLE_LABELS[item.id]}
                          <span
                            style={{
                              fontSize: 9,
                              opacity: count > 0 ? 0.9 : 0.4,
                              background: count > 0 ? "rgba(91, 140, 122, 0.25)" : "rgba(255, 255, 255, 0.05)",
                              color: count > 0 ? "var(--b-sig)" : "var(--b-fg-4)",
                              padding: "1px 5px",
                              borderRadius: 6,
                              marginLeft: 2,
                            }}
                          >
                            {count}/7
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 모드 표시 및 스위칭 토글 */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, padding: "0 2px" }}>
                    <span style={{ color: "var(--b-fg-3)", display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: wizard.mode === "all" ? "#e09f3e" : "var(--b-sig)" }} />
                      {wizard.mode === "all" ? (
                        <span style={{ color: "#e09f3e", fontWeight: 600 }}>🔄 전체 각도 순차 연결 모드 진행 중</span>
                      ) : (
                        <span style={{ color: "var(--b-sig)", fontWeight: 600 }}>🎯 단일 각도 집중 보정 모드 진행 중</span>
                      )}
                    </span>
                    
                    {wizard.mode === "single" && (
                      <button
                        type="button"
                        onClick={() => {
                          setWizard((prev) => ({
                            ...prev,
                            mode: "all",
                          }));
                          triggerSuccess("다시 전체 각도 순차 연결 모드로 변경되었습니다 (정면 ➔ 좌 ➔ 우).");
                        }}
                        style={{
                          background: "rgba(255, 255, 255, 0.04)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          color: "var(--b-fg-2)",
                          borderRadius: 6,
                          padding: "2px 8px",
                          fontSize: 9,
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)"}
                      >
                        연속 순차 모드로 복귀
                      </button>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--b-sig)", display: "flex", alignItems: "center", gap: 4 }}>
                      <Icon name="sparkle" size={10} /> {ANGLE_LABELS[wizard.angle]} 보정 중
                    </span>
                    <span style={{ fontSize: 11, color: "var(--b-fg-4)" }}>
                      단계 {wizard.stepIndex + 1} / {STRETCH_LIST.length}
                    </span>
                  </div>

                  {/* 진행 게이지바 */}
                  <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${((wizard.stepIndex + 1) / STRETCH_LIST.length) * 100}%`,
                        height: "100%",
                        background: "var(--b-sig)",
                        transition: "width 0.3s ease-out",
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 800, color: "#fff", margin: 0 }}>
                      👉 {STRETCH_LIST[wizard.stepIndex]?.label} 자세 보정
                    </h4>
                    <p style={{ fontSize: 11, color: "var(--b-fg-3)", margin: 0, lineHeight: 1.5 }}>
                      {STRETCH_LIST[wizard.stepIndex]?.desc}
                    </p>
                  </div>

                  {/* 현재 단계 캡처 유무 안내 */}
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      background: capturedData ? "rgba(91, 140, 122, 0.08)" : "rgba(255, 255, 255, 0.01)",
                      border: capturedData ? "1px solid rgba(91, 140, 122, 0.25)" : "1px dashed rgba(255,255,255,0.08)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div style={{ color: capturedData ? "var(--b-sig)" : "rgba(255,255,255,0.2)" }}>
                      <Icon name={capturedData ? "check" : "target"} size={16} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: capturedData ? "var(--b-sig)" : "var(--b-fg-2)" }}>
                        {capturedData ? "현재 단계 자세 캡처 완료! 🎯" : "자세 캡처 대기 중"}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--b-fg-4)", marginTop: 2 }}>
                        {capturedData ? "분석이 성공했습니다. 아래 버튼을 눌러 다음 단계로 진행하세요." : "카메라 앞에서 올바른 스트레칭 모션을 잡고 아래 캡처 버튼을 누르세요."}
                      </div>
                    </div>
                  </div>

                  {/* 조작 버튼 영역 */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
                    {!capturedData ? (
                      <button
                        onClick={startCapture}
                        disabled={capturing || !cameraReady}
                        style={{
                          background: "var(--b-sig)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          padding: "10px 16px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          whiteSpace: "nowrap",
                          opacity: capturing || !cameraReady ? 0.6 : 1,
                          transition: "opacity 0.2s ease",
                        }}
                      >
                        <Icon name="target" size={13} />
                        {capturing ? "분석 중..." : "동작 캡처 (2초)"}
                      </button>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
                        <button
                          onClick={startCapture}
                          disabled={capturing}
                          style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            color: "#fff",
                            borderRadius: 8,
                            padding: "10px 0",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          다시 캡처
                        </button>
                        <button
                          onClick={handleWizardNext}
                          style={{
                            background: "var(--b-sig)",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            padding: "10px 0",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                          }}
                        >
                          저장하고 다음 단계
                          <Icon name="chev-r" size={12} />
                        </button>
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                      <button
                        onClick={handleWizardPrev}
                        disabled={wizard.stepIndex <= 0}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: wizard.stepIndex <= 0 ? "rgba(255,255,255,0.15)" : "var(--b-fg-3)",
                          cursor: wizard.stepIndex <= 0 ? "not-allowed" : "pointer",
                          fontSize: 11,
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Icon name="chev-l" size={12} />
                        이전 단계
                      </button>

                      <div style={{ display: "flex", gap: 12 }}>
                        <button
                          onClick={handleWizardSkip}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--b-fg-4)",
                            cursor: "pointer",
                            fontSize: 11,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          건너뛰기 (Skip)
                          <Icon name="chev-r" size={12} />
                        </button>

                        <button
                          onClick={handleWizardCancel}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--b-warn)",
                            cursor: "pointer",
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          위저드 취소
                        </button>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingTop: 10, display: "flex", justifyContent: "center", marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={handleWizardGoToSummary}
                        style={{
                          width: "100%",
                          background: "rgba(91, 140, 122, 0.05)",
                          border: "1px dashed rgba(91, 140, 122, 0.25)",
                          color: "var(--b-sig)",
                          borderRadius: 8,
                          padding: "8px 0",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(91, 140, 122, 0.12)";
                          e.currentTarget.style.border = "1px solid var(--b-sig)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(91, 140, 122, 0.05)";
                          e.currentTarget.style.border = "1px dashed rgba(91, 140, 122, 0.25)";
                        }}
                      >
                        🏁 현재까지 보정 완료 및 저장 단계로 이동
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                // 7단계 최종 완료 및 일괄 적용 요약 화면
                <form onSubmit={handleWizardComplete} style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--b-sig)", display: "flex", alignItems: "center", gap: 4 }}>
                      <Icon name="sparkle" size={11} /> {wizard.mode === "all" ? "보정 위저드 완수!" : `[${ANGLE_LABELS[wizard.angle]}] 보정 위저드 완수!`}
                    </span>
                    <span style={{ fontSize: 10, color: "rgba(91, 140, 122, 0.8)", fontWeight: 700 }}>캡처 총 {Object.keys(wizard.drafts).length}개 완료</span>
                  </div>

                  <div style={{ fontSize: 11, opacity: 0.5, lineHeight: 1.5 }}>
                    {wizard.mode === "all" 
                      ? "전체 3개 카메라 각도의 단계별 동작 보정 작업이 수집되었습니다. 최종 저장 전 아래 요약을 확인해 주세요."
                      : `선택하신 [${ANGLE_LABELS[wizard.angle]}] 카메라 위치의 동작 캡처가 완수되었습니다. 최종 저장 전 아래 요약을 확인해 주세요.`
                    }
                  </div>

                  {/* 수집 요약 리스트 */}
                  <div
                    style={{
                      maxHeight: 110,
                      overflowY: "auto",
                      background: "rgba(255,255,255,0.01)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 8,
                      padding: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    {wizard.mode === "all" ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {ANGLE_LIST.map((ang) => {
                          const count = STRETCH_LIST.filter((s) => !!wizard.drafts[`${s.id}_${ang.id}`]).length;
                          return (
                            <div key={ang.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                              <span style={{ color: "var(--b-fg-2)", fontWeight: 700 }}>{ANGLE_LABELS[ang.id]} 카메라</span>
                              <span style={{ color: count === 7 ? "var(--b-sig)" : "var(--b-fg-3)", fontWeight: 700 }}>
                                {count} / 7개 완료 {count === 7 ? "🎯" : "⏩"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      STRETCH_LIST.map((item) => {
                        const key = `${item.id}_${wizard.angle}`;
                        const isCaptured = !!wizard.drafts[key];
                        return (
                          <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                            <span style={{ color: "var(--b-fg-2)" }}>{item.label}</span>
                            {isCaptured ? (
                              <span style={{ color: "var(--b-sig)", fontWeight: 700 }}>수집 완료 🎯</span>
                            ) : (
                              <span style={{ color: "var(--b-fg-4)", opacity: 0.4 }}>건너뜀 (기존유지) ⏩</span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "var(--b-fg-3)" }}>위저드 적용 코멘트</label>
                    <input
                      type="text"
                      required
                      placeholder="예: 5/24 좌측 카메라 기준 사용자 일괄 정밀 보정"
                      value={wizardComment}
                      onChange={(e) => setWizardComment(e.target.value)}
                      style={{
                        background: "#121212",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 6,
                        padding: "8px 10px",
                        color: "#fff",
                        fontSize: 11,
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2.5fr", gap: 8, marginTop: "auto" }}>
                    <button
                      type="button"
                      onClick={handleWizardCancel}
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "#fff",
                        borderRadius: 8,
                        padding: "10px 0",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      전체 파기
                    </button>
                    <button
                      type="submit"
                      style={{
                        background: "var(--b-sig)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "10px 0",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      <Icon name="check" size={13} />
                      모든 보정 최종 일괄 적용
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            // ==================== [기존 개별 항목 보정 모드] ====================
            <div
              style={{
                padding: 24,
                borderRadius: 16,
                background: "rgba(255, 255, 255, 0.02)",
                border: capturedData ? "1px solid var(--b-sig)" : "1px dashed rgba(255, 255, 255, 0.1)",
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                justifyContent: "center",
                gap: 16,
                minHeight: 250,
                textAlign: "center",
                position: "relative",
              }}
            >
              {capturedData ? (
                // 캡처 성공 완료 시 적용 카드
                <>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "rgba(91, 140, 122, 0.15)",
                      color: "var(--b-sig)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      alignSelf: "center",
                    }}
                  >
                    <Icon name="check" size={20} />
                  </div>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: 0 }}>
                      🎯 {STRETCH_LABEL[selectedStretch] || selectedStretch} ({ANGLE_LABELS[selectedAngle]}) 캡처 성공!
                    </h4>
                    <p style={{ fontSize: 11, opacity: 0.5, margin: 0 }}>
                      정규화된 3D 실루엣 프레임 평균화 분석이 완료되었습니다.
                    </p>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "var(--b-fg-3)" }}>개별 보정 코멘트</label>
                    <input
                      type="text"
                      placeholder="이 개별 자세 보정에 대한 간단 코멘트 (예: 오른손잡이용)"
                      value={singleComment}
                      onChange={(e) => setSingleComment(e.target.value)}
                      style={{
                        background: "#181818",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 6,
                        padding: "8px 12px",
                        color: "#fff",
                        fontSize: 11,
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2.5fr", gap: 8, marginTop: 4 }}>
                    <button
                      onClick={() => {
                        setCapturedData(null);
                        setSingleComment("");
                      }}
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "#fff",
                        borderRadius: 8,
                        padding: "10px 0",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      재캡처
                    </button>
                    <button
                      onClick={handleApply}
                      style={{
                        background: "var(--b-sig)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "10px 0",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        boxShadow: "var(--b-shadow-btn)",
                      }}
                    >
                      <Icon name="check" size={13} />
                      표준 템플릿 개별 적용
                    </button>
                  </div>
                </>
              ) : (
                // 캡처 대기중일 때의 심플 가이드 카드
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "20px 0" }}>
                  <div style={{ color: "rgba(255,255,255,0.2)" }}>
                    <Icon name="target" size={32} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--b-fg-2)", margin: 0 }}>개별 자세 보정 대기 중</h4>
                    <p style={{ fontSize: 11, opacity: 0.35, margin: 0, lineHeight: 1.5 }}>
                      좌측 제어기에서 단일 동작과 카메라 각도를 고르고<br />
                      <span style={{ color: "var(--b-sig)", fontWeight: 700 }}>동작 캡처 (2초)</span> 버튼을 눌러 개별 보정하세요.
                    </p>
                  </div>
                  
                  <div style={{ fontSize: 10, color: "var(--b-fg-4)", opacity: 0.6, marginTop: 4 }}>
                    💡 한꺼번에 편하게 하려면 우상단 <b>'일괄 보정 위저드'</b>를 사용하세요!
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 수정한 항목 실시간 관리 목록 패널 */}
          <div
            style={{
              padding: 20,
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              borderRadius: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 220,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--b-fg-2)" }}>
              🛠️ 현재 보정된 표준 템플릿 목록 ({Object.keys(adminTemplates).length})
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto", paddingRight: 4 }}>
              {Object.keys(adminTemplates).length > 0 ? (
                Object.keys(adminTemplates).map((key) => (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "rgba(255, 255, 255, 0.01)",
                      border: "1px solid rgba(255, 255, 255, 0.04)",
                      borderRadius: 12,
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "left", flex: 1 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#a8d4c4" }}>
                        {getTemplateLabel(key)}
                      </span>
                      {adminTemplates[key]?.comment && (
                        <span style={{ fontSize: 11, color: "var(--b-fg-3)", opacity: 0.8 }}>
                          💬 {adminTemplates[key].comment}
                        </span>
                      )}
                      <span style={{ fontSize: 9, opacity: 0.35 }}>
                        📅 {formatDate(adminTemplates[key]?.capturedAt)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteItem(key)}
                      style={{
                        background: "rgba(239, 68, 68, 0.1)",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        color: "var(--b-warn)",
                        borderRadius: 6,
                        padding: "6px 12px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"}
                    >
                      삭제
                    </button>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 11, opacity: 0.3, padding: "40px 0", textAlign: "center", lineHeight: 1.5 }}>
                  현재 개별 보정된 표준 템플릿이 없습니다.<br />
                  (기본 내장 하드코딩 템플릿으로 감지 중)
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
