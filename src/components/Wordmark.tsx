import { Logo } from "./Logo";

interface WordmarkProps {
  size?: number;
  color?: string;
}

export function Wordmark({ size = 32, color = "var(--b-fg-1)" }: WordmarkProps) {
  return (
    <span
      style={{
        fontFamily:
          '"Pretendard Variable", Pretendard, system-ui, sans-serif',
        fontWeight: 700,
        fontSize: size,
        letterSpacing: "-0.045em",
        color,
        lineHeight: 1,
        display: "inline-block",
      }}
    >
      barosit
    </span>
  );
}

interface LockupProps {
  size?: number;
  color?: string;
  gap?: number;
}

export function Lockup({ size = 40, color = "var(--b-fg-1)", gap = 0.2 }: LockupProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * gap,
        color,
      }}
    >
      <Logo size={size} stroke="currentColor" />
      <Wordmark size={size * 0.85} color={color} />
    </span>
  );
}
