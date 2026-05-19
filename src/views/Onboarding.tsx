import { useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";
import { platform } from "../platform";

interface Props {
  onFinish: () => void;
  onSkip: () => void;
}

const STEPS: Array<{ icon: IconName; t: string; d: string }> = [
  {
    icon: "camera",
    t: "웹캠으로 살펴봐요",
    d: "측면에 둔 카메라가 어깨와 목 각도를 1초에 30번 살펴요.",
  },
  {
    icon: "target",
    t: "잘못된 자세를 짚어드려요",
    d: "거북목·턱 괴임·어깨 기울임·등 구부정·모니터 너무 가까움·어깨 비대칭 — 여섯 가지를 구분합니다.",
  },
  {
    icon: "sparkle",
    t: "잠깐 자세를 바꿔봐요",
    d: "잔소리 대신 부드럽게. 점수와 함께 회복을 응원해요.",
  },
];

const PRIVACY_POINTS = [
  "웹캠 영상은 저장되지 않아요",
  "자세 데이터는 이 컴퓨터에만 남아요",
  "언제든 카메라를 끌 수 있어요",
];

export function Onboarding({ onFinish, onSkip }: Props) {
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
              바르게 사는 방법,
              <br />
              바르게 앉자
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
              웹캠으로 자세를 살펴드릴게요.
              <br />
              영상은 이 컴퓨터를 떠나지 않습니다.
            </p>
            <button
              className="b-btn b-btn-primary"
              onClick={next}
              style={{ height: 44, padding: "0 28px", fontSize: 14 }}
            >
              시작하기 <Icon name="arrow-r" size={14} />
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
                건너뛰기
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
              작동 원리
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
              세 가지만 기억하면 됩니다
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
                      {s.t}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--b-fg-3)",
                        lineHeight: 1.5,
                      }}
                    >
                      {s.d}
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
                뒤로
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
                다음 <Icon name="chev-r" size={13} />
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
              영상은 이 컴퓨터 안에서만
              <br />
              살펴봅니다
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
              자세 인식은 100% 온디바이스에서 처리되고, 외부로 나가는 건 없어요.
              인터넷이 끊겨도 작동합니다.
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
              {PRIVACY_POINTS.map((t, i) => (
                <div
                  key={i}
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
                  {t}
                </div>
              ))}
            </div>
            <button
              className="b-btn b-btn-primary"
              onClick={next}
              style={{ height: 44, padding: "0 24px", fontSize: 14 }}
            >
              <Icon name="camera" size={14} />
              카메라 권한 허용
            </button>
            <div style={{ marginTop: 14, fontSize: 11, color: "var(--b-fg-4)" }}>
              나중에 시스템 설정에서도 바꿀 수 있어요
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
              <a
                href="https://github.com/jay365-code/barosit/blob/main/docs/privacy.md"
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: "var(--b-fg-3)", textDecoration: "underline" }}
              >
                개인정보 처리방침
              </a>
              <span style={{ color: "var(--b-line-2)" }}>·</span>
              <a
                href="https://github.com/jay365-code/barosit/blob/main/docs/terms.md"
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: "var(--b-fg-3)", textDecoration: "underline" }}
              >
                이용약관
              </a>
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
