import { useScoreTween } from "../hooks/useScoreTween";

interface Props {
  score: number;
  size?: number;
  stroke?: number;
}

export function ScoreRing({ score, size = 160, stroke = 10 }: Props) {
  const { displayed, jumped } = useScoreTween(score);

  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, displayed)) / 100;
  const dash = C * pct;
  const color =
    displayed >= 85
      ? "var(--b-sig-deep)"
      : displayed >= 70
        ? "var(--b-sig)"
        : displayed >= 50
          ? "var(--b-amber)"
          : "var(--b-warn)";

  return (
    <div
      className={jumped ? "b-score-glow" : undefined}
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
      }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--b-line)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C - dash}`}
          style={{ transition: "stroke .6s ease" }}
        />
      </svg>
      <div
        className="b-num"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
        }}
      >
        <div
          key={jumped ? "rise" : "calm"}
          className={jumped ? "b-score-rise" : undefined}
          style={{
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color,
            transition: "color .6s ease",
          }}
        >
          {Math.round(displayed)}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--b-fg-3)",
            fontWeight: 600,
            marginTop: 4,
            letterSpacing: "0.02em",
          }}
        >
          POSTURE SCORE
        </div>
      </div>
    </div>
  );
}
