// BaroSit — "Sit Figure" mark.
// 24-unit grid: head (●) · spine (│) · shoulders (─) · seat (─).
// Reads from 16px menubar glyph to 1024px app icon without adjustment.

interface Props {
  size?: number;
  stroke?: string;
  fill?: string;
  variant?: "default" | "filled" | "micro";
  strokeWidth?: number;
}

export function Logo({
  size = 48,
  stroke = "currentColor",
  fill,
  variant = "default",
  strokeWidth,
}: Props) {
  if (variant === "filled") {
    const color = fill ?? stroke;
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        style={{ display: "block" }}
      >
        <circle cx="12" cy="4.6" r="2.2" fill={color} />
        <rect x="11.2" y="6.8" width="1.6" height="11.6" rx="0.8" fill={color} />
        <rect x="7.0" y="8.85" width="10" height="1.5" rx="0.75" fill={color} />
        <rect x="8.2" y="18.75" width="7.6" height="1.5" rx="0.75" fill={color} />
      </svg>
    );
  }

  if (variant === "micro") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth ?? 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        style={{ display: "block" }}
      >
        <circle cx="8" cy="3.4" r="1.6" />
        <path d="M8 5 L8 11.5" />
        <path d="M5.2 6.6 L10.8 6.6" />
        <path d="M5.8 12.8 L10.2 12.8" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth ?? 1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: "block" }}
    >
      <circle cx="12" cy="4.6" r="2.2" />
      <path d="M12 7 L12 18" />
      <path d="M7.4 9.6 L16.6 9.6" />
      <path d="M8.5 19.5 L15.5 19.5" />
    </svg>
  );
}

interface AppIconProps {
  size?: number;
  variant?: "signature" | "ink" | "paper" | "deep" | "sand";
  radius?: number;
}

const APP_ICON_PALETTES = {
  signature: { bg: "#5B8C7A", fg: "#FFFFFF" },
  ink: { bg: "#1A1D1F", fg: "#F5F4EE" },
  paper: { bg: "#F5F4EE", fg: "#1A1D1F" },
  deep: { bg: "#2E4A40", fg: "#E8DCC8" },
  sand: { bg: "#E8DCC8", fg: "#2E4A40" },
} as const;

export function AppIcon({
  size = 220,
  variant = "signature",
  radius = 0.225,
}: AppIconProps) {
  const p = APP_ICON_PALETTES[variant];
  const r = size * radius;
  const mark = size * 0.56;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: p.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: r,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.04))",
          pointerEvents: "none",
        }}
      />
      <Logo size={mark} variant="filled" fill={p.fg} />
    </div>
  );
}
