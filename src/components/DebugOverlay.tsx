import { useEffect, useState, type RefObject } from "react";
import type { AnalysisDebug } from "../pose/analyzer";
import type { PostureType } from "../pose/types";
import { getDetectorPerf, type DetectorPerf } from "../pose/detector";
import { loadPerformanceProfile, type PerformanceProfile } from "../performanceConfig";

interface Props {
  debugRef: RefObject<AnalysisDebug | null>;
  /** violations 를 ref 로 받음 — state 로 받으면 매 프레임 새 Set 참조라 useEffect
   * dep 가 매번 변경되어 interval 이 등록만 반복하고 fire 못하는 stale 문제 발생. */
  violationsRef: RefObject<Set<PostureType>>;
}

const POLL_MS = 150;

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "∞";
  return n.toFixed(digits);
}

function flag(b: boolean): string {
  return b ? "✓" : "·";
}

export function DebugOverlay({ debugRef, violationsRef }: Props) {
  const [snap, setSnap] = useState<AnalysisDebug | null>(null);
  const [activeStr, setActiveStr] = useState<string>("");
  const [perf, setPerf] = useState<DetectorPerf | null>(null);
  const [profile, setProfile] = useState<PerformanceProfile>("full");

  useEffect(() => {
    const id = setInterval(() => {
      setSnap(debugRef.current ? { ...debugRef.current } : null);
      const v = violationsRef.current;
      setActiveStr(
        v && v.size > 0 ? Array.from(v).join(",") : "(none)",
      );
      setPerf(getDetectorPerf());
      setProfile(loadPerformanceProfile());
    }, POLL_MS);
    return () => clearInterval(id);
  }, [debugRef, violationsRef]);

  const perfSection = perf ? (
    <div style={sectionStyle}>
      <div style={labelStyle}>perf [{profile}] {perf.delegate}</div>
      <div>
        fps={fmt(perf.fps, 1)} total={fmt(perf.total, 1)}ms
      </div>
      <div>
        pose={fmt(perf.pose, 1)} face={fmt(perf.face, 1)}{flag(perf.faceRan)} hand={fmt(perf.hands, 1)}{flag(perf.handsRan)} seg={fmt(perf.seg, 1)}{flag(perf.segRan)}
      </div>
    </div>
  ) : null;

  if (!snap) {
    return (
      <div style={overlayStyle}>
        <div style={titleStyle}>DEBUG</div>
        {perfSection}
        <div>no frame yet</div>
      </div>
    );
  }

  const { vis, face, hands, forwardHead, chin } = snap;

  return (
    <div style={overlayStyle}>
      <div style={titleStyle}>DEBUG</div>
      {perfSection}
      <div style={sectionStyle}>
        <div style={labelStyle}>active</div>
        <div>{activeStr}</div>
      </div>
      <div style={sectionStyle}>
        <div style={labelStyle}>vis (pose)</div>
        <div>
          nose={fmt(vis.nose)} ls={fmt(vis.ls)} rs={fmt(vis.rs)}
        </div>
        <div>
          lW={fmt(vis.lWrist)} rW={fmt(vis.rWrist)} lE={fmt(vis.lElbow)} rE={fmt(vis.rElbow)}
        </div>
      </div>
      <div style={sectionStyle}>
        <div style={labelStyle}>face</div>
        <div>
          present={flag(face.present)} noseFromFace={flag(face.noseFromFace)}
        </div>
        <div>
          pitchΔ={fmt(face.pitchDelta)} tzΔ={fmt(face.tzDelta, 3)}
        </div>
      </div>
      <div style={sectionStyle}>
        <div style={labelStyle}>hands</div>
        <div>
          count={hands.count} minFingerToFace={fmt(hands.minFingerToFace, 3)}
        </div>
      </div>
      <div style={sectionStyle}>
        <div style={labelStyle}>forward_head</div>
        <div>
          total={fmt(forwardHead.total)} / thr={fmt(forwardHead.threshold)}
        </div>
        <div>
          size={fmt(forwardHead.headSize)} z={fmt(forwardHead.z)}
          {" "}drop={fmt(forwardHead.drop)} pitch={fmt(forwardHead.pitch)}
        </div>
        <div>neckDrift={fmt(forwardHead.neckDrift)}</div>
      </div>
      <div style={sectionStyle}>
        <div style={labelStyle}>chin_resting</div>
        <div>
          lAtChin={flag(chin.lAtChin)} lForeUp={flag(chin.lForearmUp)}
        </div>
        <div>
          rAtChin={flag(chin.rAtChin)} rForeUp={flag(chin.rForearmUp)}
        </div>
        <div>
          fingerNear={flag(chin.fingerNearChin)} wristRaised={flag(chin.handWristRaised)}
        </div>
        <div>
          veryClose={flag(chin.fingerVeryCloseToFace)} occludedByHand={flag(chin.noseOccludedByHand)}
        </div>
        <div>
          lElbowChin={flag(chin.leftElbowChin)} rElbowChin={flag(chin.rightElbowChin)}
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 8,
  right: 8,
  zIndex: 9999,
  background: "rgba(0, 0, 0, 0.78)",
  color: "#0ff",
  padding: "8px 10px",
  borderRadius: 6,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11,
  lineHeight: 1.4,
  minWidth: 280,
  pointerEvents: "none",
  border: "1px solid rgba(0, 255, 255, 0.3)",
};

const titleStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "#fff",
  marginBottom: 4,
  letterSpacing: 1,
};

const sectionStyle: React.CSSProperties = {
  marginTop: 4,
  paddingTop: 4,
  borderTop: "1px solid rgba(0, 255, 255, 0.15)",
};

const labelStyle: React.CSSProperties = {
  color: "#fffaa0",
  fontWeight: 600,
};
