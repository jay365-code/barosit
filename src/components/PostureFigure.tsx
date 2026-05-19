export type PostureFigureState =
  | "good"
  | "forward-head"
  | "chin-prop"
  | "shoulder-tilt"
  | "slouch";

interface Props {
  state?: PostureFigureState;
  accent?: string;
  warn?: string;
  dim?: string;
  size?: number;
  /** 라인 굵기. 기본 3.4 — 큰 사이즈일 때 4~5 권장 */
  strokeWidth?: number;
}

interface Geom {
  neckDx: number;
  neckDy: number;
  headTilt: number;
  shoulderTilt: number;
  backCurve: number;
  propArm?: boolean;
  highlight: "neck" | "chin" | "shoulder" | "back" | null;
}

export function PostureFigure({
  state = "good",
  accent = "var(--b-sig)",
  warn = "var(--b-warn)",
  dim = "rgba(0,0,0,0.12)",
  size = 200,
  strokeWidth = 3.4,
}: Props) {
  const sw = strokeWidth;
  const G: Geom = (() => {
    switch (state) {
      case "forward-head":
        return {
          neckDx: 16,
          neckDy: -2,
          headTilt: 0,
          shoulderTilt: 0,
          backCurve: 0,
          highlight: "neck",
        };
      case "chin-prop":
        return {
          neckDx: 8,
          neckDy: 4,
          headTilt: -10,
          shoulderTilt: 0,
          backCurve: 0,
          propArm: true,
          highlight: "chin",
        };
      case "shoulder-tilt":
        return {
          neckDx: 0,
          neckDy: 0,
          headTilt: -4,
          shoulderTilt: 12,
          backCurve: 0,
          highlight: "shoulder",
        };
      case "slouch":
        return {
          neckDx: 10,
          neckDy: 2,
          headTilt: 4,
          shoulderTilt: 0,
          backCurve: 14,
          highlight: "back",
        };
      default:
        return {
          neckDx: 0,
          neckDy: 0,
          headTilt: 0,
          shoulderTilt: 0,
          backCurve: 0,
          highlight: null,
        };
    }
  })();

  const hipX = 100;
  const hipY = 200;
  const shoulderX = 100;
  const shoulderY = 110 + G.shoulderTilt;
  const neckX = shoulderX + G.neckDx;
  const neckY = shoulderY - 22 + G.neckDy;
  const headX = neckX;
  const headY = neckY - 24;
  const isWarn = G.highlight !== null;
  const stroke = isWarn ? warn : accent;

  return (
    <svg
      viewBox="0 0 200 240"
      width={size}
      height={size}
      style={{ display: "block" }}
      aria-hidden
    >
      {/* chair seat */}
      <line x1="40" y1="210" x2="160" y2="210" stroke={dim} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="40" y1="210" x2="40" y2="232" stroke={dim} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="160" y1="210" x2="160" y2="232" stroke={dim} strokeWidth="1.5" strokeLinecap="round" />

      {/* back curve from hip → shoulder */}
      <path
        d={`M ${hipX} ${hipY} C ${hipX + G.backCurve} ${(hipY + shoulderY) / 2}, ${shoulderX + G.backCurve} ${
          (hipY + shoulderY) / 2 - 10
        }, ${shoulderX} ${shoulderY}`}
        fill="none"
        stroke={G.highlight === "back" ? warn : accent}
        strokeWidth={sw}
        strokeLinecap="round"
      />

      {/* neck */}
      <line
        x1={shoulderX}
        y1={shoulderY}
        x2={neckX}
        y2={neckY}
        stroke={G.highlight === "neck" || G.highlight === "chin" ? warn : accent}
        strokeWidth={sw}
        strokeLinecap="round"
      />

      {/* head — slight rotation */}
      <g transform={`rotate(${G.headTilt} ${headX} ${headY})`}>
        <circle
          cx={headX}
          cy={headY}
          r="14"
          fill="none"
          stroke={
            G.highlight === "neck" || G.highlight === "chin" || G.highlight === "back"
              ? warn
              : accent
          }
          strokeWidth={sw}
        />
        <line
          x1={headX + 12}
          y1={headY + 1}
          x2={headX + 18}
          y2={headY + 1}
          stroke={stroke}
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.55"
        />
      </g>

      {/* shoulder tilt indicator */}
      {G.shoulderTilt !== 0 && (
        <line
          x1={shoulderX - 12}
          y1={shoulderY - G.shoulderTilt * 0.4}
          x2={shoulderX + 12}
          y2={shoulderY + G.shoulderTilt * 0.4}
          stroke={warn}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}

      {/* arm */}
      {G.propArm ? (
        <path
          d={`M ${shoulderX} ${shoulderY} L ${shoulderX + 26} ${shoulderY + 22} L ${headX + 12} ${headY + 8}`}
          fill="none"
          stroke={warn}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <line
          x1={shoulderX}
          y1={shoulderY}
          x2={shoulderX + 6}
          y2={shoulderY + 50}
          stroke={accent}
          strokeWidth={sw}
          strokeLinecap="round"
          opacity="0.65"
        />
      )}

      {/* reference vertical */}
      <line
        x1="100"
        y1="86"
        x2="100"
        y2="200"
        stroke="currentColor"
        strokeOpacity="0.10"
        strokeWidth="1.2"
        strokeDasharray="2 4"
      />
    </svg>
  );
}
