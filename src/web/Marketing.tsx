import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import privacyMd from "../../docs/privacy.md?raw";
import termsMd from "../../docs/terms.md?raw";
import { supabase } from "../auth/supabase";
import { useAuth } from "../auth/useAuth";
import { interpolateLegalTemplate } from "../lib/legal";
import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";
import {
  MAIN_SLOGAN_LINE1,
  MAIN_SLOGAN_LINE2,
  pickSubSlogan,
} from "../slogans";

// const CONTACT_EMAIL = "support@barosit.com";
const GITHUB_URL = "https://github.com/jay365-code/barosit";

export const trackPaymentEvent = (
  eventName:
    | "pricing_view_loaded"
    | "checkout_initiated"
    | "checkout_completed"
    | "checkout_failed"
    | "subscription_cancel_initiated"
    | "subscription_cancel_confirmed"
    | "subscription_resume_confirmed"
    | "card_update_initiated"
    | "card_update_failed",
  params?: Record<string, any>
) => {
  const payload = {
    event: eventName,
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    ...params,
  };
  console.log(`[Analytics]`, JSON.stringify(payload, null, 2));
};

// ───────── Shared ─────────

function TopNav({ active }: { active?: string }) {
  const { user } = useAuth();
  const items = [
    { label: "기능", hash: "#/landing" },
    { label: "가격", hash: "#/pricing" },
    { label: "다운로드", hash: "#/download/mac" },
    { label: "커뮤니티", hash: "#/community" },
  ];
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    "";
  const avatarUrl = (meta.avatar_url as string | undefined) ?? null;
  const initial = (fullName || user?.email || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "20px 56px",
        borderBottom: "1px solid var(--b-line)",
        background: "var(--b-bg)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <a
        href="#/landing"
        style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}
      >
        <Logo size={28} stroke="var(--b-sig)" />
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.04em" }}>
          barosit
        </span>
      </a>
      <div style={{ display: "flex", gap: 4, marginLeft: 32 }}>
        {items.map((i) => (
          <a
            key={i.label}
            href={i.hash}
            style={{
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 500,
              color: i.label === active ? "var(--b-fg-1)" : "var(--b-fg-3)",
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            {i.label}
          </a>
        ))}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
        {user ? (
          <a
            href="#/profile"
            title={user.email ?? ""}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 10px 4px 4px",
              borderRadius: 999,
              border: "1px solid var(--b-line)",
              background: "var(--b-surface)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <Avatar size={26} initial={initial} imageUrl={avatarUrl} />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                maxWidth: 120,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {fullName || user.email}
            </span>
          </a>
        ) : (
          <a href="#/login" className="b-btn b-btn-quiet" style={{ textDecoration: "none" }}>
            로그인
          </a>
        )}
        <a
          href="#/download/mac"
          className="b-btn b-btn-primary"
          style={{ textDecoration: "none" }}
        >
          <Icon name="arrow-r" size={13} />
          다운로드
        </a>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div
      style={{
        padding: "60px 56px 40px",
        borderTop: "1px solid var(--b-line)",
        maxWidth: 1180,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 32,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 24,
        }}
      >
        {/* 회사 정보 및 사업자 등록 정보 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={24} stroke="var(--b-sig)" />
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.03em" }}>
              barosit
            </span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--b-fg-3)",
              lineHeight: 1.6,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div>주식회사 구비드 | 대표자: 이종현</div>
            <div>주소: 서울특별시 송파구 오금로15길 5-12, 3층 3425호 (방이동, 정환빌딩)</div>
            <div>
              사업자등록번호: 512-88-00059 | 통신판매업신고: 제 2025-서울송파-2552호
            </div>
            <div>전화: 02-2147-2513</div>
          </div>
        </div>

        {/* 법적 고지 및 링크 */}
        <div style={{ display: "flex", gap: 24, fontSize: 13, fontWeight: 500 }}>
          <a href="#/changelog" style={{ color: "var(--b-fg-2)", textDecoration: "none" }}>
            업데이트 내역
          </a>
          <a href="#/privacy" style={{ color: "var(--b-fg-2)", textDecoration: "none" }}>
            개인정보 처리방침
          </a>
          <a href="#/terms" style={{ color: "var(--b-fg-2)", textDecoration: "none" }}>
            이용약관
          </a>
          <a href="#/community" style={{ color: "var(--b-fg-2)", textDecoration: "none" }}>
            커뮤니티
          </a>
        </div>
      </div>

      {/* 하단 저작권 표시 */}
      <div
        style={{
          borderTop: "1px solid var(--b-line)",
          paddingTop: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
          color: "var(--b-fg-4)",
        }}
      >
        <span>© 2026 Barosit. All rights reserved.</span>
      </div>
    </div>
  );
}

function MiniCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 14,
        background: "var(--b-surface)",
        border: "1px solid var(--b-line)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "var(--b-sig-soft)",
            color: "var(--b-sig-deep)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={14} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function Avatar({
  size = 80,
  initial,
  imageUrl,
}: {
  size?: number;
  initial?: string;
  imageUrl?: string | null;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        referrerPolicy="no-referrer"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #7eb09c 0%, #3f6e5e 100%)",
        color: "#fff",
        fontSize: size * 0.4,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        letterSpacing: "-0.02em",
        flexShrink: 0,
      }}
    >
      {initial ?? "김"}
    </div>
  );
}

// ───────── Landing ─────────

function Landing() {
  const subSlogan = pickSubSlogan();
  return (
    <div style={{ background: "var(--b-bg)" }}>
      <TopNav />

      <div style={{ padding: "80px 56px 60px", maxWidth: 1180, margin: "0 auto" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 999,
            background: "var(--b-sig-bg)",
            border: "1px solid var(--b-sig-soft)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--b-sig-deep)",
            marginBottom: 28,
          }}
        >
          <Icon name="shield" size={12} />
          온디바이스 · 영상은 외부로 나가지 않습니다
        </div>
        <h1
          style={{
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.038em",
            margin: 0,
            marginBottom: 16,
            maxWidth: 900,
          }}
        >
          {MAIN_SLOGAN_LINE1}
          <br />
          <span style={{ color: "var(--b-sig-deep)" }}>{MAIN_SLOGAN_LINE2}</span>
        </h1>
        <p
          style={{
            fontSize: 22,
            color: "var(--b-fg-1)",
            fontWeight: 600,
            lineHeight: 1.4,
            maxWidth: 620,
            margin: 0,
            marginBottom: 14,
            letterSpacing: "-0.01em",
          }}
        >
          {subSlogan}
        </p>
        <p
          style={{
            fontSize: 17,
            color: "var(--b-fg-2)",
            lineHeight: 1.55,
            maxWidth: 560,
            margin: 0,
            marginBottom: 36,
          }}
        >
          웹캠으로 자세를 살펴드릴게요. 거북목·턱 괴임·어깨 기울임·등 구부정·모니터
          거리·어깨 비대칭·머리 갸우뚱 7종을 살펴보다 잘못된 자세가 일정 시간 이어지면
          부드럽게 알려드립니다.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <a
            href="#/app"
            className="b-btn b-btn-primary"
            style={{ height: 48, padding: "0 22px", fontSize: 14, textDecoration: "none" }}
          >
            <Icon name="arrow-r" size={14} /> 웹에서 바로 시작
          </a>
          <a
            href="#/download/mac"
            className="b-btn b-btn-ghost"
            style={{ height: 48, padding: "0 20px", fontSize: 14, textDecoration: "none" }}
          >
            Mac 다운로드
          </a>
          <a
            href="#/download/win"
            className="b-btn b-btn-ghost"
            style={{ height: 48, padding: "0 20px", fontSize: 14, textDecoration: "none" }}
          >
            Windows 다운로드
          </a>
        </div>
        <div className="b-num" style={{ fontSize: 12, color: "var(--b-fg-4)" }}>
          설치 없이 브라우저에서 바로 · 데스크탑 앱은 백그라운드·위젯 지원
        </div>
      </div>

      <div style={{ padding: "80px 56px", maxWidth: 1180, margin: "0 auto" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--b-sig)",
            letterSpacing: "0.1em",
            marginBottom: 12,
          }}
        >
          작동 원리
        </div>
        <h2
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "-0.028em",
            marginBottom: 48,
            maxWidth: 700,
          }}
        >
          세 가지만 기억하면
          <br />
          됩니다
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
          {(
            [
              {
                icon: "camera",
                t: "웹캠으로 살펴봐요",
                d: "측면에 둔 카메라가 어깨와 목 각도를 1초에 30번 살펴요. 사이드 모니터 위에 노트북을 두면 좋아요.",
              },
              {
                icon: "target",
                t: "잘못된 자세를 짚어드려요",
                d: "거북목 · 턱 괴임 · 어깨 기울임 · 등 구부정 · 모니터 거리 · 어깨 비대칭 · 머리 갸우뚱. 7종을 구분해 알려드려요.",
              },
              {
                icon: "sparkle",
                t: "잠깐 자세를 바꿔봐요",
                d: "잔소리 대신 부드럽게. 점수와 함께 회복을 응원하고, 스트레칭은 보너스 점수로 돌려드려요.",
              },
            ] as Array<{ icon: IconName; t: string; d: string }>
          ).map((s, i) => (
            <div
              key={i}
              style={{
                padding: 28,
                borderRadius: 16,
                background: "var(--b-surface)",
                border: "1px solid var(--b-line)",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "var(--b-sig-soft)",
                  color: "var(--b-sig-deep)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                }}
              >
                <Icon name={s.icon} size={20} />
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--b-fg-3)",
                  marginBottom: 6,
                }}
                className="b-num"
              >
                0{i + 1}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  marginBottom: 8,
                  letterSpacing: "-0.018em",
                }}
              >
                {s.t}
              </div>
              <div style={{ fontSize: 14, color: "var(--b-fg-3)", lineHeight: 1.6 }}>
                {s.d}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "60px 56px",
          background: "var(--b-sig-bg)",
          borderTop: "1px solid var(--b-line)",
          borderBottom: "1px solid var(--b-line)",
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 60,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "var(--b-sig)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 24,
              }}
            >
              <Icon name="shield" size={24} />
            </div>
            <h2
              style={{
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: "-0.028em",
                marginBottom: 18,
                lineHeight: 1.15,
              }}
            >
              영상은 이 컴퓨터 안에서만 살펴봅니다
            </h2>
            <p
              style={{
                fontSize: 16,
                color: "var(--b-fg-2)",
                lineHeight: 1.6,
                marginBottom: 24,
              }}
            >
              자세 인식은 100% 온디바이스에서 처리됩니다. 영상도, 자세 데이터도 외부
              서버로 나가지 않아요. 인터넷이 끊겨도 작동합니다.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                "웹캠 영상은 저장되지 않아요",
                "자세 데이터는 이 컴퓨터에만 남아요",
                "카메라 영상은 외부 서버로 절대 나가지 않아요",
              ].map((t, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 14,
                    color: "var(--b-fg-1)",
                  }}
                >
                  <Icon name="check" size={16} style={{ color: "var(--b-sig)" }} />
                  {t}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { k: "On-device", v: "100%" },
              { k: "클라우드", v: "0%" },
              { k: "오프라인", v: "작동" },
              { k: "동작 분석", v: "7가지" },
            ].map((c, i) => (
              <div
                key={i}
                style={{
                  padding: 24,
                  borderRadius: 14,
                  background: "var(--b-surface)",
                  border: "1px solid var(--b-line)",
                }}
              >
                <div
                  className="b-num"
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: "var(--b-sig-deep)",
                    letterSpacing: "-0.025em",
                    marginBottom: 4,
                  }}
                >
                  {c.v}
                </div>
                <div style={{ fontSize: 13, color: "var(--b-fg-3)", fontWeight: 600 }}>
                  {c.k}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "80px 56px", maxWidth: 1180, margin: "0 auto" }}>
        <h2
          style={{
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "-0.026em",
            marginBottom: 36,
          }}
        >
          꼭 필요한 기능만
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {(
            [
              {
                i: "target",
                t: "자세 7종 감지",
                d: "거북목 · 턱 괴임 · 어깨 기울임 · 등 구부정 · 모니터 거리 · 어깨 비대칭 · 머리 갸우뚱을 구분해 짚어드려요",
              },
              {
                i: "sparkle",
                t: "0–100 점수 시스템",
                d: "좋은 자세 유지 시 회복 가속, 위반은 그레이스 2초 후 패널티",
              },
              {
                i: "minimize",
                t: "위젯 모드",
                d: "작은 알약 하나로 작업을 방해하지 않고 점수만 살짝 보여드려요",
              },
              { i: "moon", t: "다크 모드", d: "시그니처 색 그대로, 야간 작업에도 눈 편하게" },
            ] as Array<{ i: IconName; t: string; d: string }>
          ).map((f, i) => (
            <div
              key={i}
              style={{
                padding: 24,
                borderRadius: 14,
                background: "var(--b-surface)",
                border: "1px solid var(--b-line)",
                display: "flex",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "var(--b-sig-soft)",
                  color: "var(--b-sig-deep)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={f.i} size={18} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{f.t}</div>
                <div style={{ fontSize: 13, color: "var(--b-fg-3)", lineHeight: 1.55 }}>
                  {f.d}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "80px 56px 100px",
          textAlign: "center",
          maxWidth: 700,
          margin: "0 auto",
        }}
      >
        <h2
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "-0.028em",
            marginBottom: 14,
            lineHeight: 1.15,
          }}
        >
          오늘부터 바르게 앉아볼까요
        </h2>
        <p style={{ fontSize: 16, color: "var(--b-fg-2)", marginBottom: 28 }}>
          무료로 시작하고, Pro는 언제든 결제하세요.
        </p>
        <div style={{ display: "inline-flex", gap: 10 }}>
          <a
            href="#/download/mac"
            className="b-btn b-btn-primary"
            style={{
              height: 48,
              padding: "0 22px",
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Mac 다운로드
          </a>
          <a
            href="#/download/win"
            className="b-btn b-btn-ghost"
            style={{
              height: 48,
              padding: "0 22px",
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Windows 다운로드
          </a>
        </div>
      </div>

      <Footer />
    </div>
  );
}

// ───────── Auth Callback ─────────

function findAuthParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  const u = new URL(window.location.href);
  const fromSearch = u.searchParams.get(key);
  if (fromSearch) return fromSearch;
  const hash = window.location.hash;
  const q = hash.indexOf("?");
  if (q !== -1) {
    const hashParams = new URLSearchParams(hash.slice(q + 1));
    return hashParams.get(key);
  }
  return null;
}

function AuthCallback() {
  const { configured } = useAuth();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!configured) {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(
            "Supabase 가 아직 설정되지 않았어요. .env.local 의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인하세요.",
          );
        }
        return;
      }
      try {
        const errorDesc =
          findAuthParam("error_description") ?? findAuthParam("error");
        if (errorDesc) throw new Error(decodeURIComponent(errorDesc));

        // SDK 의 detectSessionInUrl 이 클라이언트 init 시 자동으로 code 를
        // exchange 합니다. 먼저 그 결과를 확인하고, 못 잡았을 때만 수동 exchange.
        let { data } = await supabase.auth.getSession();

        if (!data.session) {
          const code = findAuthParam("code");
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
            const result = await supabase.auth.getSession();
            data = result.data;
          }
        }

        if (cancelled) return;
        if (!data.session) throw new Error("세션을 확인할 수 없어요.");
        
        const redirectTo = localStorage.getItem("barosit:auth_redirect");
        if (redirectTo) {
          localStorage.removeItem("barosit:auth_redirect");
          window.location.replace(redirectTo);
        } else {
          window.location.replace("#/app");
        }
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(
          e instanceof Error ? e.message : "로그인을 완료할 수 없어요.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  return (
    <div
      style={{
        background: "var(--b-bg)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          padding: 32,
          borderRadius: 16,
          background: "var(--b-surface)",
          border: "1px solid var(--b-line)",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <Logo size={36} stroke="var(--b-sig)" />
        </div>
        {status === "loading" ? (
          <>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "-0.018em",
                marginBottom: 6,
              }}
            >
              로그인 마무리 중…
            </h2>
            <p style={{ fontSize: 13, color: "var(--b-fg-3)", margin: 0 }}>
              계정 정보를 확인하고 있어요. 잠시만요.
            </p>
          </>
        ) : (
          <>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "-0.018em",
                marginBottom: 6,
              }}
            >
              로그인을 완료하지 못했어요
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--b-fg-3)",
                margin: 0,
                marginBottom: 18,
              }}
            >
              {errorMsg}
            </p>
            <a
              href="#/login"
              className="b-btn b-btn-primary"
              style={{ textDecoration: "none" }}
            >
              로그인 화면으로 돌아가기
            </a>
          </>
        )}
      </div>
    </div>
  );
}

// ───────── Legal (Privacy / Terms) ─────────

const LEGAL_TITLE: Record<"privacy" | "terms", string> = {
  privacy: "개인정보 처리방침",
  terms: "이용약관",
};

const LEGAL_SOURCE: Record<"privacy" | "terms", string> = {
  privacy: privacyMd,
  terms: termsMd,
};

function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const md = useMemo(() => interpolateLegalTemplate(LEGAL_SOURCE[kind]), [kind]);
  const otherKind = kind === "privacy" ? "terms" : "privacy";
  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav />
      <div
        style={{
          maxWidth: 820,
          margin: "0 auto",
          padding: "60px 56px 80px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--b-sig)",
            letterSpacing: "0.1em",
            marginBottom: 10,
          }}
        >
          LEGAL
        </div>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: "-0.028em",
            margin: 0,
            marginBottom: 8,
            lineHeight: 1.15,
          }}
        >
          {LEGAL_TITLE[kind]}
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--b-fg-3)",
            margin: 0,
            marginBottom: 32,
          }}
        >
          본 문서는 앱과 동일한 소스(<code>docs/{kind}.md</code>)로 렌더됩니다.
        </p>
        <div
          className="b-legal-body"
          style={{
            border: "1px solid var(--b-line)",
            borderRadius: 14,
            background: "var(--b-surface)",
            padding: "28px 32px",
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children, ...props }) => {
                if (!href) return <>{children}</>;
                if (href.includes("pricing-policy.md")) {
                  return (
                    <a
                      href="#"
                      style={{ cursor: "pointer", textDecoration: "underline" }}
                      onClick={(e) => {
                        e.preventDefault();
                        alert(
                          `[BaroSit 구독 요금 및 환불 정책 요약]\n\n` +
                          `1. 청약철회 (결제 후 7일 이내):\n` +
                          ` - 서비스 이용 이력이 없는 경우, 결제 수수료 공제 없이 100% 전액 환불\n\n` +
                          `2. 중도 환불 및 해지 (이용 이력이 있거나 7일 경과):\n` +
                          ` - 월간 구독: 당월 잔여 기간까지 이용 후 다음 결제일에 정기 결제 자동 종료 (권장)\n` +
                          ` - 중도 즉시 환불: 결제 대금의 10% 위약금 및 이용 일수(일일 300원) 공제 후 잔액 환불\n` +
                          ` - 연간 구독 중도 즉시 환불: 연간 할인혜택이 소급 소멸되며, 이용 일수(정가 기준 일할 계산) 및 10% 위약금 공제 후 잔액 환불\n\n` +
                          `3. 환불 신청 및 문의:\n` +
                          ` - 프로필 메뉴 [구독 관리 -> 환불/구독 해지 신청] 이용\n` +
                          ` - 또는 대표 CS 이메일 (support@barosit.com)로 접수`
                        );
                      }}
                    >
                      {children}
                    </a>
                  );
                }
                if (href.includes("changelog.md")) {
                  return (
                    <a href="#/changelog" style={{ textDecoration: "underline" }}>
                      {children}
                    </a>
                  );
                }
                if (href.includes("settings.md")) {
                  return (
                    <a
                      href="https://github.com/jay365-code/barosit/blob/main/docs/settings.md"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: "underline" }}
                    >
                      {children}
                    </a>
                  );
                }
                if (href.includes("privacy.md")) {
                  return (
                    <a href="#/privacy" style={{ textDecoration: "underline" }}>
                      {children}
                    </a>
                  );
                }
                if (href.includes("terms.md")) {
                  return (
                    <a href="#/terms" style={{ textDecoration: "underline" }}>
                      {children}
                    </a>
                  );
                }
                const isExternal = href.startsWith("http") || href.startsWith("//");
                return (
                  <a
                    href={href}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    style={{ textDecoration: "underline" }}
                    {...props}
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {md}
          </ReactMarkdown>
        </div>
        <div
          style={{
            marginTop: 28,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <a
            href={`#/${otherKind}`}
            className="b-btn b-btn-ghost"
            style={{ textDecoration: "none" }}
          >
            <Icon name="arrow-r" size={12} /> {LEGAL_TITLE[otherKind]} 보기
          </a>
          <a
            href="#/community"
            className="b-btn b-btn-quiet"
            style={{ textDecoration: "none" }}
          >
            커뮤니티 바로가기
          </a>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function ChangelogPage() {
  const [releases, setReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReleases = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("releases")
          .select("*")
          .order("released_at", { ascending: false });
        
        if (error) {
          throw error;
        }
        setReleases(data || []);
      } catch (err: any) {
        console.error("Failed to fetch releases:", err);
        setError("릴리즈 내역을 불러오는 중 오류가 발생했습니다. (데이터베이스에 'releases' 테이블이 등록되었는지 확인해주세요.)");
      } finally {
        setLoading(false);
      }
    };
    fetchReleases();
  }, []);

  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav />
      <div
        style={{
          maxWidth: 820,
          margin: "0 auto",
          padding: "60px 56px 80px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--b-sig)",
            letterSpacing: "0.1em",
            marginBottom: 10,
          }}
        >
          RELEASE NOTES
        </div>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: "-0.028em",
            margin: 0,
            marginBottom: 8,
            lineHeight: 1.15,
          }}
        >
          공지사항 및 업데이트 내역
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--b-fg-3)",
            margin: 0,
            marginBottom: 32,
          }}
        >
          BaroSit의 최신 업데이트 정보와 기능 변경 소식을 한눈에 확인하세요.
        </p>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0", color: "var(--b-fg-3)", fontSize: 14 }}>
            업데이트 내역을 불러오는 중입니다...
          </div>
        ) : error ? (
          <div style={{ padding: "40px", border: "1px solid #ff4d4f", borderRadius: 14, background: "rgba(255, 77, 79, 0.05)", color: "#ff4d4f", fontSize: 14, textAlign: "center" }}>
            {error}
          </div>
        ) : releases.length === 0 ? (
          <div style={{ padding: "80px 40px", border: "1px solid var(--b-line)", borderRadius: 14, background: "var(--b-surface)", color: "var(--b-fg-3)", fontSize: 14, textAlign: "center" }}>
            등록된 업데이트 내역이 아직 없습니다.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {releases.map((release) => (
              <div
                key={release.id}
                style={{
                  border: "1px solid var(--b-line)",
                  borderRadius: 14,
                  background: "var(--b-surface)",
                  padding: "36px 40px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                {/* 헤더: 버전 + 날짜 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--b-line)", paddingBottom: 16, flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      style={{
                        background: "var(--b-sig)",
                        color: "#fff",
                        padding: "4px 12px",
                        borderRadius: 20,
                        fontSize: 14,
                        fontWeight: 700,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {release.version}
                    </span>
                  </div>
                  <span style={{ fontSize: 13, color: "var(--b-fg-3)", fontWeight: 500 }}>
                    {new Date(release.released_at).toLocaleString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {/* 본문 마크다운 */}
                <div className="b-legal-body" style={{ fontSize: 14, lineHeight: 1.7, color: "var(--b-fg-2)" }}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children, ...props }) => {
                        if (!href) return <>{children}</>;
                        const isExternal = href.startsWith("http") || href.startsWith("//");
                        return (
                          <a
                            href={href}
                            target={isExternal ? "_blank" : undefined}
                            rel={isExternal ? "noopener noreferrer" : undefined}
                            style={{ textDecoration: "underline" }}
                            {...props}
                          >
                            {children}
                          </a>
                        );
                      },
                    }}
                  >
                    {release.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 40,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <a
            href="#/landing"
            className="b-btn b-btn-ghost"
            style={{ textDecoration: "none" }}
          >
            홈으로 가기
          </a>
          <a
            href="#/privacy"
            className="b-btn b-btn-quiet"
            style={{ textDecoration: "none" }}
          >
            개인정보 처리방침 보기
          </a>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ───────── Contact ─────────

function Contact() {
  const { user } = useAuth();

  // --- States ---
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "write" | "detail">("list");
  const [activePost, setActivePost] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Filter & Sort & Category
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "likes">("recent");
  const [activeCategory, setActiveCategory] = useState<string>("전체");

  // Post Form States
  const [writeTitle, setWriteTitle] = useState("");
  const [writeContent, setWriteContent] = useState("");
  const [writeAuthor, setWriteAuthor] = useState("");
  const [writePassword, setWritePassword] = useState("");
  const [writeCategory, setWriteCategory] = useState("💡 기능 제안");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Comment Form States
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [commentPassword, setCommentPassword] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // Password Verification Modal
  const [passwordModal, setPasswordModal] = useState<{
    isOpen: boolean;
    type: "post_delete" | "comment_delete";
    targetId: string;
    error: string | null;
  }>({
    isOpen: false,
    type: "post_delete",
    targetId: "",
    error: null,
  });
  const [passwordInput, setPasswordInput] = useState("");

  // Input Focus States
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // --- Auto-set profile display name for logged-in users ---
  useEffect(() => {
    if (user) {
      const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "";
      setWriteAuthor(displayName);
      setCommentAuthor(displayName);
    } else {
      setWriteAuthor("");
      setCommentAuthor("");
    }
  }, [user, view]);

  // --- Password Hashing (SHA-256) ---
  const hashPassword = async (password: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  // --- DB Fetching ---
  const fetchPosts = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let query = supabase.from("posts").select("*");

      if (searchQuery.trim()) {
        query = query.or(
          `title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%,author_name.ilike.%${searchQuery}%`
        );
      }

      if (activeCategory !== "전체") {
        query = query.eq("category", activeCategory);
      }

      if (sortBy === "likes") {
        query = query.order("likes", { ascending: false }).order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;
      setPosts(data || []);
    } catch (err: any) {
      console.error("Error fetching posts:", err);
      setErrorMsg("게시글 목록을 불러오는 도중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async (postId: string) => {
    setCommentsLoading(true);
    try {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setComments(data || []);
    } catch (err) {
      console.error("Error fetching comments:", err);
    } finally {
      setCommentsLoading(false);
    }
  };

  // --- Effects ---
  useEffect(() => {
    fetchPosts();
  }, [sortBy, activeCategory]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      fetchPosts();
    }
  };

  // --- Actions ---
  const handleSelectPost = async (post: any) => {
    setActivePost(post);
    setView("detail");
    fetchComments(post.id);

    // Increment Views with sessionStorage check (1 view per session)
    const viewKey = `barosit_viewed_${post.id}`;
    if (!sessionStorage.getItem(viewKey)) {
      sessionStorage.setItem(viewKey, "true");
      try {
        await supabase
          .from("posts")
          .update({ views: post.views + 1 })
          .eq("id", post.id);
        // Update local state views count
        setPosts((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, views: p.views + 1 } : p))
        );
      } catch (err) {
        console.error("Error updating views:", err);
      }
    }
  };

  const handleLikePost = async (e: React.MouseEvent, post: any) => {
    e.stopPropagation();
    const likeKey = `barosit_liked_${post.id}`;
    if (localStorage.getItem(likeKey)) {
      alert("이미 이 글을 추천하셨습니다.");
      return;
    }

    try {
      const { error } = await supabase
        .from("posts")
        .update({ likes: post.likes + 1 })
        .eq("id", post.id);
      if (error) throw error;

      localStorage.setItem(likeKey, "true");
      // Update states
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, likes: p.likes + 1 } : p))
      );
      if (activePost && activePost.id === post.id) {
        setActivePost((prev: any) => ({ ...prev, likes: prev.likes + 1 }));
      }
    } catch (err) {
      console.error("Error liking post:", err);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const needsPassword = !user;

    if (!writeTitle.trim() || !writeContent.trim() || !writeAuthor.trim() || (needsPassword && !writePassword.trim())) {
      setErrorMsg("모든 빈칸을 빠짐없이 채워주세요.");
      return;
    }
    if (needsPassword && writePassword.length < 4) {
      setErrorMsg("비밀번호는 최소 4자리 이상 입력해주세요.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const hashedPassword = needsPassword ? await hashPassword(writePassword) : "";
      const { error } = await supabase.from("posts").insert([
        {
          title: writeTitle.trim(),
          content: writeContent.trim(),
          author_name: writeAuthor.trim(),
          password_hash: hashedPassword,
          user_id: user ? user.id : null,
          category: writeCategory,
        },
      ]);

      if (error) throw error;

      // Reset
      setWriteTitle("");
      setWriteContent("");
      setWritePassword("");
      if (!user) setWriteAuthor("");
      setView("list");
      fetchPosts();
    } catch (err: any) {
      console.error("Error creating post:", err);
      setErrorMsg(err.message || "글 작성 도중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePost) return;

    const needsPassword = !user;
    if (!commentAuthor.trim() || !commentContent.trim() || (needsPassword && !commentPassword.trim())) {
      alert("모든 빈칸을 채워주세요.");
      return;
    }
    if (needsPassword && commentPassword.length < 4) {
      alert("댓글 비밀번호는 최소 4자리 이상 입력해주세요.");
      return;
    }

    setCommentSubmitting(true);
    try {
      const hashedPassword = needsPassword ? await hashPassword(commentPassword) : "";
      const { error } = await supabase.from("comments").insert([
        {
          post_id: activePost.id,
          content: commentContent.trim(),
          author_name: commentAuthor.trim(),
          password_hash: hashedPassword,
          user_id: user ? user.id : null,
        },
      ]);

      if (error) throw error;

      setCommentContent("");
      setCommentPassword("");
      if (!user) setCommentAuthor("");
      fetchComments(activePost.id);
    } catch (err) {
      console.error("Error creating comment:", err);
      alert("댓글 등록에 실패했습니다.");
    } finally {
      setCommentSubmitting(false);
    }
  };

  // --- Deletion Handler with Direct Member Option ---
  const handlePostDeleteClick = () => {
    if (activePost.user_id && user && activePost.user_id === user.id) {
      if (confirm("정말로 이 게시글을 삭제하시겠습니까?")) {
        executeDirectDelete("post_delete", activePost.id);
      }
    } else {
      openDeleteModal("post_delete", activePost.id);
    }
  };

  const handleCommentDeleteClick = (comment: any) => {
    if (comment.user_id && user && comment.user_id === user.id) {
      if (confirm("정말로 이 댓글을 삭제하시겠습니까?")) {
        executeDirectDelete("comment_delete", comment.id);
      }
    } else {
      openDeleteModal("comment_delete", comment.id);
    }
  };

  const executeDirectDelete = async (type: "post_delete" | "comment_delete", targetId: string) => {
    if (!user) return;
    try {
      if (type === "post_delete") {
        const { data, error } = await supabase
          .from("posts")
          .delete()
          .eq("id", targetId)
          .eq("user_id", user.id)
          .select();

        if (error) throw error;

        if (!data || data.length === 0) {
          alert("삭제 권한이 없거나 이미 삭제된 게시글입니다.");
          return;
        }

        setView("list");
        setActivePost(null);
        fetchPosts();
      } else {
        const { data, error } = await supabase
          .from("comments")
          .delete()
          .eq("id", targetId)
          .eq("user_id", user.id)
          .select();

        if (error) throw error;

        if (!data || data.length === 0) {
          alert("삭제 권한이 없거나 이미 삭제된 댓글입니다.");
          return;
        }

        if (activePost) {
          fetchComments(activePost.id);
        }
      }
    } catch (err) {
      console.error("Error executing direct delete:", err);
      alert("삭제 작업 중 서버 오류가 발생했습니다.");
    }
  };

  const openDeleteModal = (type: "post_delete" | "comment_delete", targetId: string) => {
    setPasswordInput("");
    setPasswordModal({
      isOpen: true,
      type,
      targetId,
      error: null,
    });
  };

  const closeDeleteModal = () => {
    setPasswordModal({ isOpen: false, type: "post_delete", targetId: "", error: null });
    setPasswordInput("");
  };

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;

    setPasswordModal((prev) => ({ ...prev, error: null }));
    try {
      const hashed = await hashPassword(passwordInput);

      if (passwordModal.type === "post_delete") {
        // Delete post matching id and password_hash
        const { data, error } = await supabase
          .from("posts")
          .delete()
          .eq("id", passwordModal.targetId)
          .eq("password_hash", hashed)
          .select();

        if (error) throw error;

        if (!data || data.length === 0) {
          setPasswordModal((prev) => ({
            ...prev,
            error: "비밀번호가 올바르지 않거나 회원 글은 비밀번호로 삭제할 수 없습니다.",
          }));
          return;
        }

        // Success
        closeDeleteModal();
        setView("list");
        setActivePost(null);
        fetchPosts();
      } else {
        // Delete comment matching id and password_hash
        const { data, error } = await supabase
          .from("comments")
          .delete()
          .eq("id", passwordModal.targetId)
          .eq("password_hash", hashed)
          .select();

        if (error) throw error;

        if (!data || data.length === 0) {
          setPasswordModal((prev) => ({
            ...prev,
            error: "비밀번호가 올바르지 않거나 회원 댓글은 비밀번호로 삭제할 수 없습니다.",
          }));
          return;
        }

        // Success
        closeDeleteModal();
        if (activePost) {
          fetchComments(activePost.id);
        }
      }
    } catch (err) {
      console.error("Error deleting:", err);
      setPasswordModal((prev) => ({
        ...prev,
        error: "삭제 작업 중 서버 오류가 발생했습니다.",
      }));
    }
  };

  // Helper date formatter
  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${y}.${m}.${d} ${h}:${min}`;
  };

  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav active="커뮤니티" />
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "70px 24px 80px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--b-sig)",
            letterSpacing: "0.1em",
            marginBottom: 10,
            textAlign: "center",
          }}
        >
          COMMUNITY BOARD
        </div>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: "-0.028em",
            margin: 0,
            marginBottom: 12,
            lineHeight: 1.15,
            textAlign: "center",
          }}
        >
          {view === "list" && "활발한 생각과 의견의 나눔터"}
          {view === "write" && "새로운 이야기 등록"}
          {view === "detail" && activePost?.title}
        </h1>
        <p
          style={{
            fontSize: 15,
            color: "var(--b-fg-2)",
            lineHeight: 1.6,
            marginBottom: 36,
            textAlign: "center",
            maxWidth: 520,
            marginInline: "auto",
          }}
        >
          {view === "list" && "유용한 정보와 자세 꿀팁, 기능 제안 및 자유 토론을 나누어보세요. 우리 모두의 건강한 자세를 위한 전문적인 소통 공간입니다."}
          {view === "write" && "작성하신 소중한 글은 커뮤니티 모든 유저들과 실시간으로 공유됩니다."}
          {view === "detail" && `작성자: ${activePost?.author_name} · 작성일: ${formatDate(activePost?.created_at || "")}`}
        </p>

        {/* ───────── VIEW 1: BOARD LIST ───────── */}
        {view === "list" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            
            {/* Category Pills (Disquiet Style) */}
            <div
              style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 4,
                msOverflowStyle: "none",
                scrollbarWidth: "none",
              }}
            >
              {["전체", "💡 기능 제안", "🔥 자세인증 챌린지", "📢 자유 토론", "❓ 질문/답변"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    border: "1px solid",
                    borderColor: activeCategory === cat ? "var(--b-sig)" : "var(--b-line)",
                    background: activeCategory === cat ? "var(--b-sig)" : "rgba(255, 255, 255, 0.5)",
                    color: activeCategory === cat ? "#ffffff" : "var(--b-fg-2)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.2s ease",
                    boxShadow: activeCategory === cat ? "0 4px 12px var(--b-sig-soft)" : "none",
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Filter & Action Panel */}
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderRadius: 16,
                background: "rgba(255, 255, 255, 0.45)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                boxShadow: "0 4px 20px 0 rgba(0, 0, 0, 0.02)",
              }}
            >
              {/* Search & Sort */}
              <div style={{ display: "flex", gap: 10, flex: 1, minWidth: 260 }}>
                {/* Search */}
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="제목, 내용, 작성자 검색..."
                    style={{
                      width: "100%",
                      padding: "9px 16px 9px 36px",
                      borderRadius: 10,
                      border: "1px solid var(--b-line)",
                      background: "rgba(255, 255, 255, 0.8)",
                      fontSize: 14,
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 0.2s ease",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--b-fg-3)",
                      display: "flex",
                    }}
                  >
                    <Icon name="eye" size={14} />
                  </div>
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setTimeout(() => fetchPosts(), 0);
                      }}
                      style={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        border: "none",
                        background: "none",
                        color: "var(--b-fg-3)",
                        cursor: "pointer",
                        display: "flex",
                      }}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>

                {/* Sort dropdown */}
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  style={{
                    padding: "0 14px",
                    height: 38,
                    borderRadius: 10,
                    border: "1px solid var(--b-line)",
                    background: "rgba(255, 255, 255, 0.8)",
                    fontSize: 13,
                    fontWeight: 600,
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="recent">최신순</option>
                  <option value="likes">추천순</option>
                </select>
              </div>

              {/* Write Trigger */}
              <button
                onClick={() => setView("write")}
                className="b-btn b-btn-primary"
                style={{
                  height: 38,
                  fontSize: 13,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 16px",
                  borderRadius: 10,
                  boxShadow: "0 4px 12px var(--b-sig-soft)",
                }}
              >
                <Icon name="plus" size={14} />
                <span>이야기 등록하기</span>
              </button>
            </div>

            {/* Posts Cards Grid */}
            {loading ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 0",
                  color: "var(--b-fg-3)",
                  fontSize: 15,
                }}
              >
                커뮤니티 글을 불러오는 중입니다...
              </div>
            ) : posts.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "80px 24px",
                  background: "rgba(255, 255, 255, 0.25)",
                  borderRadius: 20,
                  border: "1px solid var(--b-line)",
                  color: "var(--b-fg-3)",
                }}
              >
                <div style={{ marginBottom: 12 }}>
                  <Icon name="info" size={32} style={{ opacity: 0.6 }} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--b-fg-1)" }}>
                  등록된 게시글이 없습니다.
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  가장 먼저 따뜻하고 유익한 첫 이야기를 시작해 보세요!
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {posts.map((post) => {
                  const isLiked = localStorage.getItem(`barosit_liked_${post.id}`);
                  return (
                    <div
                      key={post.id}
                      onClick={() => handleSelectPost(post)}
                      style={{
                        padding: "20px 24px",
                        borderRadius: 18,
                        background: "rgba(255, 255, 255, 0.45)",
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                        border: "1px solid rgba(255, 255, 255, 0.3)",
                        boxShadow: "0 4px 24px 0 rgba(0, 0, 0, 0.03)",
                        cursor: "pointer",
                        display: "flex",
                        gap: 20,
                        alignItems: "center",
                        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                        position: "relative",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.borderColor = "var(--b-sig-soft)";
                        e.currentTarget.style.boxShadow = "0 8px 30px 0 rgba(0,0,0,0.06)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                        e.currentTarget.style.boxShadow = "0 4px 24px 0 rgba(0, 0, 0, 0.03)";
                      }}
                    >
                      {/* Product Hunt Style Side Upvote */}
                      <div
                        onClick={(e) => handleLikePost(e, post)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 48,
                          height: 58,
                          borderRadius: 12,
                          border: isLiked ? "1px solid var(--b-sig)" : "1px solid var(--b-line)",
                          background: isLiked ? "var(--b-sig-soft)" : "rgba(255, 255, 255, 0.8)",
                          color: isLiked ? "var(--b-sig)" : "var(--b-fg-2)",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => {
                          e.stopPropagation();
                          e.currentTarget.style.borderColor = "var(--b-sig)";
                          e.currentTarget.style.background = "var(--b-sig-soft)";
                          e.currentTarget.style.color = "var(--b-sig)";
                        }}
                        onMouseLeave={(e) => {
                          e.stopPropagation();
                          e.currentTarget.style.borderColor = isLiked ? "var(--b-sig)" : "var(--b-line)";
                          e.currentTarget.style.background = isLiked ? "var(--b-sig-soft)" : "rgba(255, 255, 255, 0.8)";
                          e.currentTarget.style.color = isLiked ? "var(--b-sig)" : "var(--b-fg-2)";
                        }}
                      >
                        <Icon name="chev-u" size={16} stroke={2.4} style={{ marginBottom: 2 }} />
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{post.likes}</span>
                      </div>

                      {/* Content Area */}
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        {/* Header & Meta */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 6,
                                background: "var(--b-line)",
                                color: "var(--b-fg-2)",
                              }}
                            >
                              {post.category || "자유"}
                            </span>
                            <h3
                              style={{
                                fontSize: 17,
                                fontWeight: 700,
                                color: "var(--b-fg-1)",
                                margin: 0,
                                lineHeight: 1.4,
                              }}
                            >
                              {post.title}
                            </h3>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 12,
                              color: "var(--b-fg-3)",
                              flexShrink: 0,
                            }}
                          >
                            <Icon name="eye" size={13} /> {post.views}
                          </div>
                        </div>

                        {/* Excerpt Body */}
                        <p
                          style={{
                            fontSize: 14,
                            color: "var(--b-fg-2)",
                            margin: 0,
                            lineHeight: 1.5,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {post.content}
                        </p>

                        {/* Metadata Footer */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: 12,
                            color: "var(--b-fg-3)",
                            borderTop: "1px solid var(--b-line)",
                            paddingTop: 10,
                            marginTop: 2,
                          }}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            작성자: <strong style={{ color: "var(--b-fg-2)" }}>{post.author_name}</strong>
                            {post.user_id ? (
                              <span style={{
                                fontSize: 10,
                                padding: "1px 5px",
                                borderRadius: 4,
                                background: "rgba(16, 185, 129, 0.1)",
                                color: "#10b981",
                                fontWeight: 700,
                              }}>👑 회원</span>
                            ) : (
                              <span style={{
                                fontSize: 10,
                                padding: "1px 5px",
                                borderRadius: 4,
                                background: "rgba(107, 114, 128, 0.1)",
                                color: "#6b7280",
                                fontWeight: 600,
                              }}>🌱 익명</span>
                            )}
                          </span>
                          <span>{formatDate(post.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ───────── VIEW 2: WRITE FORM ───────── */}
        {view === "write" && (
          <form
            onSubmit={handleCreatePost}
            style={{
              padding: "36px 32px",
              borderRadius: 20,
              background: "rgba(255, 255, 255, 0.45)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.04)",
              display: "flex",
              flexDirection: "column",
              gap: 22,
              animation: "fadeIn 0.3s ease",
            }}
          >
            {errorMsg && (
              <div
                style={{
                  padding: "14px 18px",
                  borderRadius: 10,
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  color: "#b91c1c",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon name="info" size={15} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Category Selector Pill */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--b-fg-2)" }}>
                주제 선택 <span style={{ color: "var(--b-sig)" }}>*</span>
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["💡 기능 제안", "🔥 자세인증 챌린지", "📢 자유 토론", "❓ 질문/답변"].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setWriteCategory(cat)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 12,
                      border: "1px solid",
                      borderColor: writeCategory === cat ? "var(--b-sig)" : "var(--b-line)",
                      background: writeCategory === cat ? "var(--b-sig-soft)" : "rgba(255, 255, 255, 0.8)",
                      color: writeCategory === cat ? "var(--b-sig)" : "var(--b-fg-2)",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Author & Password Fields */}
            <div style={{ display: "grid", gridTemplateColumns: user ? "1fr" : "1fr 1fr", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--b-fg-2)" }}>
                  닉네임 <span style={{ color: "var(--b-sig)" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={writeAuthor}
                  onChange={(e) => setWriteAuthor(e.target.value)}
                  placeholder="작성자 별명"
                  disabled={submitting}
                  onFocus={() => setFocusedField("author")}
                  onBlur={() => setFocusedField(null)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: focusedField === "author" ? "1px solid var(--b-sig)" : "1px solid var(--b-line)",
                    boxShadow: focusedField === "author" ? "0 0 0 3px var(--b-sig-soft)" : "none",
                    background: "rgba(255, 255, 255, 0.8)",
                    fontSize: 14,
                    outline: "none",
                    transition: "all 0.2s ease",
                  }}
                />
              </div>

              {!user && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "var(--b-fg-2)" }}>
                    수정/삭제 비밀번호 <span style={{ color: "var(--b-sig)" }}>*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={writePassword}
                    onChange={(e) => setWritePassword(e.target.value)}
                    placeholder="4자리 이상"
                    disabled={submitting}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    style={{
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: focusedField === "password" ? "1px solid var(--b-sig)" : "1px solid var(--b-line)",
                      boxShadow: focusedField === "password" ? "0 0 0 3px var(--b-sig-soft)" : "none",
                      background: "rgba(255, 255, 255, 0.8)",
                      fontSize: 14,
                      outline: "none",
                      transition: "all 0.2s ease",
                    }}
                  />
                </div>
              )}
            </div>

            {user && (
              <div style={{ fontSize: 12, color: "var(--b-sig)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="check" size={14} />
                <span>로그인된 회원 계정으로 글이 등록됩니다. 비밀번호 입력 없이 편리하게 삭제가 가능합니다.</span>
              </div>
            )}

            {/* Title */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--b-fg-2)" }}>
                제목 <span style={{ color: "var(--b-sig)" }}>*</span>
              </label>
              <input
                type="text"
                required
                value={writeTitle}
                onChange={(e) => setWriteTitle(e.target.value)}
                placeholder="게시글의 제목을 입력하세요."
                disabled={submitting}
                onFocus={() => setFocusedField("title")}
                onBlur={() => setFocusedField(null)}
                style={{
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: focusedField === "title" ? "1px solid var(--b-sig)" : "1px solid var(--b-line)",
                  boxShadow: focusedField === "title" ? "0 0 0 3px var(--b-sig-soft)" : "none",
                  background: "rgba(255, 255, 255, 0.8)",
                  fontSize: 15,
                  outline: "none",
                  transition: "all 0.2s ease",
                }}
              />
            </div>

            {/* Content */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--b-fg-2)" }}>
                글 내용 <span style={{ color: "var(--b-sig)" }}>*</span>
              </label>
              <textarea
                required
                rows={8}
                value={writeContent}
                onChange={(e) => setWriteContent(e.target.value)}
                placeholder="유용한 자세 습관, 후기, 기능 제안 및 챌린지 인증 등 BaroSit 사용자들과 다양한 생각을 공유해 보세요!"
                disabled={submitting}
                onFocus={() => setFocusedField("content")}
                onBlur={() => setFocusedField(null)}
                style={{
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: focusedField === "content" ? "1px solid var(--b-sig)" : "1px solid var(--b-line)",
                  boxShadow: focusedField === "content" ? "0 0 0 3px var(--b-sig-soft)" : "none",
                  background: "rgba(255, 255, 255, 0.8)",
                  fontSize: 14,
                  outline: "none",
                  resize: "vertical",
                  lineHeight: 1.5,
                  minHeight: 180,
                  transition: "all 0.2s ease",
                }}
              />
            </div>

            {/* Form actions */}
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setView("list");
                  setErrorMsg(null);
                }}
                disabled={submitting}
                className="b-btn b-btn-ghost"
                style={{
                  flex: 1,
                  height: 46,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                취소하기
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="b-btn b-btn-primary"
                style={{
                  flex: 1.5,
                  height: 46,
                  fontSize: 14,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.85 : 1,
                }}
              >
                {submitting ? "등록 중..." : "이야기 공유하기"}
                {!submitting && <Icon name="arrow-r" size={14} />}
              </button>
            </div>
          </form>
        )}

        {/* ───────── VIEW 3: DETAIL VIEW & COMMENTS ───────── */}
        {view === "detail" && activePost && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 0.3s ease" }}>
            {/* Back Button */}
            <button
              onClick={() => {
                setView("list");
                setActivePost(null);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "none",
                color: "var(--b-fg-2)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                padding: "8px 0",
                width: "fit-content",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--b-sig)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--b-fg-2)")}
            >
              <Icon name="chev-l" size={16} />
              <span>목록으로 돌아가기</span>
            </button>

            {/* Post Main Body Card */}
            <div
              style={{
                padding: "36px 32px",
                borderRadius: 20,
                background: "rgba(255, 255, 255, 0.45)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.04)",
              }}
            >
              {/* Category tag display */}
              <div style={{ marginBottom: 16 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 8,
                    background: "var(--b-sig-soft)",
                    color: "var(--b-sig)",
                  }}
                >
                  {activePost.category || "자유"}
                </span>
              </div>

              {/* Content text */}
              <p
                style={{
                  fontSize: 16,
                  color: "var(--b-fg-1)",
                  lineHeight: 1.7,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  marginBottom: 36,
                }}
              >
                {activePost.content}
              </p>

              {/* Engagement Stats & Deletion Panel */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid var(--b-line)",
                  paddingTop: 20,
                }}
              >
                <div style={{ display: "flex", gap: 10 }}>
                  {/* Like Button */}
                  <button
                    onClick={(e) => handleLikePost(e, activePost)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 16px",
                      borderRadius: 12,
                      border: "1px solid var(--b-line)",
                      background: "rgba(255, 255, 255, 0.7)",
                      color: "var(--b-fg-2)",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--b-sig)";
                      e.currentTarget.style.color = "var(--b-sig)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--b-line)";
                      e.currentTarget.style.color = "var(--b-fg-2)";
                    }}
                  >
                    <Icon name="chev-u" size={13} stroke={2.4} />
                    <span>추천 {activePost.likes}</span>
                  </button>
                </div>

                {/* Delete Trigger */}
                <button
                  onClick={handlePostDeleteClick}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    background: "rgba(239, 68, 68, 0.02)",
                    color: "#dc2626",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)";
                    e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.02)";
                    e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.2)";
                  }}
                >
                  <Icon name="trash" size={13} />
                  <span>글 삭제</span>
                </button>
              </div>
            </div>

            {/* --- Comments Section (Reddit Style Threading) --- */}
            <div
              style={{
                padding: "32px 32px 36px",
                borderRadius: 20,
                background: "rgba(255, 255, 255, 0.25)",
                border: "1px solid var(--b-line)",
                display: "flex",
                flexDirection: "column",
                gap: 24,
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--b-fg-1)", margin: 0 }}>
                댓글 ({comments.length}개)
              </h3>

              {/* Comments List */}
              {commentsLoading ? (
                <div style={{ fontSize: 13, color: "var(--b-fg-3)" }}>댓글을 로딩 중입니다...</div>
              ) : comments.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--b-fg-3)", padding: "8px 0" }}>
                  아직 등록된 댓글이 없습니다. 첫 마디를 나누어보세요!
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      style={{
                        padding: "16px 20px 16px 24px",
                        borderRadius: 14,
                        background: "rgba(255, 255, 255, 0.5)",
                        border: "1px solid var(--b-line)",
                        // Reddit Thread Line 데코레이션
                        borderLeft: "3px solid var(--b-sig)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        position: "relative",
                      }}
                    >
                      {/* Comment Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--b-fg-2)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {comment.author_name}
                          {comment.user_id ? (
                            <span style={{
                              fontSize: 9,
                              padding: "1px 4px",
                              borderRadius: 3,
                              background: "rgba(16, 185, 129, 0.1)",
                              color: "#10b981",
                              fontWeight: 700,
                            }}>회원</span>
                          ) : (
                            <span style={{
                              fontSize: 9,
                              padding: "1px 4px",
                              borderRadius: 3,
                              background: "rgba(107, 114, 128, 0.1)",
                              color: "#6b7280",
                              fontWeight: 600,
                            }}>익명</span>
                          )}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 11, color: "var(--b-fg-3)" }}>
                            {formatDate(comment.created_at)}
                          </span>
                          <button
                            onClick={() => handleCommentDeleteClick(comment)}
                            style={{
                              border: "none",
                              background: "none",
                              color: "var(--b-fg-3)",
                              cursor: "pointer",
                              padding: 2,
                              display: "flex",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "#dc2626")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--b-fg-3)")}
                            title="댓글 삭제"
                          >
                            <Icon name="x" size={13} />
                          </button>
                        </div>
                      </div>
                      {/* Comment Content */}
                      <p style={{ fontSize: 14, color: "var(--b-fg-1)", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {comment.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Comment Write Form */}
              <form
                onSubmit={handleCreateComment}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  borderTop: "1px solid var(--b-line)",
                  paddingTop: 20,
                  marginTop: 8,
                }}
              >
                {/* Input Fields Row */}
                <div style={{ display: "grid", gridTemplateColumns: user ? "1fr" : "1fr 1fr", gap: 12 }}>
                  <input
                    type="text"
                    required
                    placeholder="닉네임"
                    value={commentAuthor}
                    onChange={(e) => setCommentAuthor(e.target.value)}
                    disabled={commentSubmitting}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--b-line)",
                      background: "rgba(255, 255, 255, 0.8)",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                  {!user && (
                    <input
                      type="password"
                      required
                      placeholder="삭제용 비밀번호(4자 이상)"
                      value={commentPassword}
                      onChange={(e) => setCommentPassword(e.target.value)}
                      disabled={commentSubmitting}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: "1px solid var(--b-line)",
                        background: "rgba(255, 255, 255, 0.8)",
                        fontSize: 13,
                        outline: "none",
                      }}
                    />
                  )}
                </div>

                {/* Content and Submit Row */}
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <textarea
                    required
                    rows={2}
                    placeholder={user ? "회원 계정으로 따뜻한 댓글을 남겨보세요..." : "따뜻하고 유익한 댓글을 입력해 주세요..."}
                    value={commentContent}
                    onChange={(e) => setCommentContent(e.target.value)}
                    disabled={commentSubmitting}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--b-line)",
                      background: "rgba(255, 255, 255, 0.8)",
                      fontSize: 13,
                      outline: "none",
                      resize: "none",
                      lineHeight: 1.4,
                    }}
                  />
                  <button
                    type="submit"
                    disabled={commentSubmitting}
                    className="b-btn b-btn-primary"
                    style={{
                      height: 42,
                      padding: "0 20px",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: commentSubmitting ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {commentSubmitting ? "등록 중" : "등록"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ───────── VERIFICATION MODAL ───────── */}
        {passwordModal.isOpen && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.35)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              animation: "fadeIn 0.2s ease",
            }}
          >
            <form
              onSubmit={handleDeleteSubmit}
              style={{
                width: "100%",
                maxWidth: 360,
                padding: "28px 24px",
                borderRadius: 18,
                background: "#ffffff",
                boxShadow: "0 10px 40px rgba(0, 0, 0, 0.12)",
                border: "1px solid var(--b-line)",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h4 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--b-fg-1)" }}>
                  비밀번호 인증
                </h4>
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  style={{ border: "none", background: "none", cursor: "pointer", color: "var(--b-fg-3)", display: "flex" }}
                >
                  <Icon name="x" size={16} />
                </button>
              </div>

              <p style={{ fontSize: 13, color: "var(--b-fg-3)", margin: 0, lineHeight: 1.5 }}>
                {passwordModal.type === "post_delete"
                  ? "게시글을 안전하게 삭제하기 위해 글을 쓸 때 입력했던 비밀번호를 입력해 주세요."
                  : "댓글을 영구히 삭제하기 위해 등록 시 설정했던 비밀번호를 입력해 주세요."}
              </p>

              <input
                type="password"
                required
                autoFocus
                placeholder="비밀번호 입력"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--b-line)",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />

              {passwordModal.error && (
                <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
                  {passwordModal.error}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  style={{
                    flex: 1,
                    height: 38,
                    borderRadius: 8,
                    border: "1px solid var(--b-line)",
                    background: "none",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1.2,
                    height: 38,
                    borderRadius: 8,
                    border: "none",
                    background: "#dc2626",
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  인증 및 삭제
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ───────── SUB-CARDS (EMAIL COPY & INFO) ───────── */}
        {view === "list" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 40, marginBottom: 20 }}>
            <div
              style={{
                padding: 22,
                borderRadius: 14,
                background: "rgba(255, 255, 255, 0.35)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: "1px solid var(--b-line)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                  직접 메일 발송
                </div>
                <p style={{ fontSize: 12, color: "var(--b-fg-3)", margin: 0, marginBottom: 14, lineHeight: 1.5 }}>
                  공개 토론에 적합하지 않거나, 비공개로 전달하실 중요 제휴/결제 관련 용건은 아래 버튼을 클릭하여 공식 지원 이메일을 간편하게 복사하세요.
                </p>
              </div>
              <button
                type="button"
                onClick={handleContactClick}
                className="b-btn b-btn-ghost"
                style={{ fontSize: 12, height: 36, padding: "0 14px", display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 6 }}
              >
                <span>메일 주소 복사하기</span> <Icon name="sparkle" size={10} />
              </button>
            </div>

            <div
              style={{
                padding: 22,
                borderRadius: 14,
                background: "rgba(255, 255, 255, 0.35)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: "1px solid var(--b-line)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                  이용 안내 및 건의
                </div>
                <p style={{ fontSize: 12, color: "var(--b-fg-3)", margin: 0, marginBottom: 14, lineHeight: 1.5 }}>
                  작성하신 커뮤니티 생각들은 다른 사용자들에게 좋은 정보가 됩니다. 쾌적한 커뮤니티 조성을 위해 건전하고 올바른 대화 예절을 부탁드립니다.
                </p>
              </div>
              <div
                style={{ fontSize: 12, fontWeight: 600, color: "var(--b-sig-deep)", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Icon name="info" size={12} /> <span>365일 24시간 실시간 모니터링 중</span>
              </div>
            </div>
          </div>
        )}

        {/* Operating Corporate Info */}
        <div
          style={{
            padding: 24,
            borderRadius: 14,
            background: "rgba(0, 0, 0, 0.015)",
            border: "1px solid var(--b-line)",
            marginTop: 20,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--b-fg-3)",
              letterSpacing: "0.08em",
              marginBottom: 12,
            }}
          >
            주식회사 구비드 (GUBED)
          </div>
          <div style={{ fontSize: 12, color: "var(--b-fg-2)", lineHeight: 1.8 }}>
            <div>대표이사 : 이종현 · 사업자등록번호 : 512-88-00059</div>
            <div>주소 : 서울특별시 송파구 오금로15길 5-12, 3층 3425호</div>
            <div>통신판매업신고번호 : 제 2025-서울송파-2552호 · 고객센터 : 02-2147-2513</div>
            <div style={{ marginTop: 4 }}>
              오픈소스 코드 저장소 :{" "}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--b-sig-deep)", textDecoration: "underline", fontWeight: 500 }}
              >
                {GITHUB_URL.replace("https://", "")}
              </a>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ───────── Login / Signup ─────────

function Login({ mode = "signin" }: { mode?: "signin" | "signup" }) {
  const subSlogan = pickSubSlogan();
  const {
    signInWithGoogle,
    signInWithKakao,
    configured,
    user,
    loading
  } = useAuth();
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      const redirectTo = localStorage.getItem("barosit:auth_redirect");
      if (redirectTo) {
        localStorage.removeItem("barosit:auth_redirect");
        window.location.replace(redirectTo);
      } else {
        window.location.replace("#/app");
      }
    }
  }, [loading, user]);

  const handleOAuth = async (provider: "google" | "kakao", signInFn: () => Promise<void>) => {
    setOauthError(null);
    if (!configured) {
      setOauthError("아직 인증이 연결되지 않았습니다. .env.local 의 Supabase 설정을 확인하세요.");
      return;
    }
    setOauthBusy(provider);
    try {
      await signInFn();
    } catch (e) {
      setOauthBusy(null);
      const provName = {
        google: "Google",
        kakao: "카카오",
      }[provider];
      setOauthError(e instanceof Error ? e.message : `${provName} 로그인에 실패했어요.`);
    }
  };

  const handleGoogle = () => handleOAuth("google", signInWithGoogle);
  const handleKakao = () => handleOAuth("kakao", signInWithKakao);

  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh", display: "flex" }}>
      <div
        style={{
          flex: 1,
          padding: "60px 56px",
          background: "var(--b-sig-bg)",
          borderRight: "1px solid var(--b-line)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <a
          href="#/landing"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <Logo size={32} stroke="var(--b-sig)" />
          <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.04em" }}>
            barosit
          </span>
        </a>
        <div>
          <h1
            style={{
              fontSize: 48,
              fontWeight: 700,
              letterSpacing: "-0.032em",
              lineHeight: 1.15,
              marginBottom: 12,
            }}
          >
            {MAIN_SLOGAN_LINE1}
            <br />
            <span style={{ color: "var(--b-sig-deep)" }}>{MAIN_SLOGAN_LINE2}</span>
          </h1>
          <p
            style={{
              fontSize: 17,
              color: "var(--b-fg-1)",
              fontWeight: 600,
              lineHeight: 1.45,
              maxWidth: 380,
              marginBottom: 10,
              letterSpacing: "-0.01em",
            }}
          >
            {subSlogan}
          </p>
          <p
            style={{
              fontSize: 14,
              color: "var(--b-fg-2)",
              lineHeight: 1.55,
              maxWidth: 380,
            }}
          >
            웹캠으로 자세를 살펴드릴게요.
            <br />
            영상은 이 컴퓨터를 떠나지 않습니다.
          </p>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--b-fg-4)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="shield" size={12} /> 자세 데이터는 사용자가 동기화를 켤 때만
          클라우드로 갑니다.
        </div>
      </div>

      <div
        style={{
          flex: 1,
          padding: "60px 56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div style={{ maxWidth: 380, width: "100%", margin: "0 auto" }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.022em",
              marginBottom: 6,
            }}
          >
            {mode === "signin" ? "다시 오셨군요" : "시작해볼까요"}
          </h2>
          <p style={{ fontSize: 13, color: "var(--b-fg-3)", marginBottom: 28 }}>
            {mode === "signin" ? "간편한 소셜 로그인으로 계속하세요" : "1초 만에 회원 가입이 가능합니다"}
          </p>

          {/* 메인 소셜 로그인 세트 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {/* Google */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={oauthBusy !== null}
              className="b-btn"
              style={{
                height: 46,
                borderRadius: 24,
                border: "1px solid var(--b-line)",
                background: "#ffffff",
                color: "var(--b-fg-1)",
                fontWeight: 600,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                cursor: oauthBusy ? "wait" : "pointer",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                transform: oauthBusy === "google" ? "scale(0.98)" : "none",
                opacity: oauthBusy && oauthBusy !== "google" ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.06)";
                }
              }}
              onMouseLeave={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.02)";
                }
              }}
            >
              <svg
                aria-hidden
                width="16"
                height="16"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0 }}
              >
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09 0-.72.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {oauthBusy === "google" ? "Google 로 이동 중…" : "Google로 계속하기"}
            </button>

            {/* Kakao */}
            <button
              type="button"
              onClick={handleKakao}
              disabled={oauthBusy !== null}
              className="b-btn"
              style={{
                height: 46,
                borderRadius: 24,
                border: "none",
                background: "#fee500",
                color: "#191919",
                fontWeight: 600,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                cursor: oauthBusy ? "wait" : "pointer",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "0 2px 8px rgba(254, 229, 0, 0.15)",
                transform: oauthBusy === "kakao" ? "scale(0.98)" : "none",
                opacity: oauthBusy && oauthBusy !== "kakao" ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 14px rgba(254, 229, 0, 0.3)";
                }
              }}
              onMouseLeave={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(254, 229, 0, 0.15)";
                }
              }}
            >
              <svg
                aria-hidden
                width="16"
                height="16"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0 }}
              >
                <path
                  fill="#191919"
                  d="M12 3C6.48 3 2 6.48 2 10.8c0 2.75 1.85 5.16 4.63 6.55l-1.18 4.34c-.05.19.05.39.23.47.06.03.13.04.2.04.13 0 .26-.05.36-.13l5.07-3.36c.23.02.46.04.69.04 5.52 0 10-3.48 10-7.8S17.52 3 12 3z"
                />
              </svg>
              {oauthBusy === "kakao" ? "카카오로 이동 중…" : "카카오로 계속하기"}
            </button>
          </div>

          {oauthError && (
            <div
              role="alert"
              style={{
                marginBottom: 18,
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                color: "#dc2626",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {oauthError}
            </div>
          )}

          <p
            style={{
              fontSize: 11,
              color: "var(--b-fg-4)",
              lineHeight: 1.55,
              textAlign: "center",
              marginTop: 12,
              marginBottom: 0,
            }}
          >
            계속하시면{" "}
            <a
              href="#/terms"
              style={{ color: "var(--b-fg-3)", textDecoration: "underline" }}
            >
              이용약관
            </a>
            과{" "}
            <a
              href="#/privacy"
              style={{ color: "var(--b-fg-3)", textDecoration: "underline" }}
            >
              개인정보 처리방침
            </a>
            에 동의하게 됩니다.
          </p>

          <div
            style={{
              fontSize: 13,
              color: "var(--b-fg-3)",
              textAlign: "center",
              marginTop: 18,
            }}
          >
            {mode === "signin" ? (
              <>
                처음이신가요?{" "}
                <a
                  href="#/signup"
                  style={{ color: "var(--b-sig)", fontWeight: 600, textDecoration: "none" }}
                >
                  가입하기
                </a>
              </>
            ) : (
              <>
                이미 계정이 있나요?{" "}
                <a
                  href="#/login"
                  style={{ color: "var(--b-sig)", fontWeight: 600, textDecoration: "none" }}
                >
                  로그인
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────── Download ─────────

function Download({ os = "mac" }: { os?: "mac" | "win" }) {
  const { user } = useAuth();
  const [userPlan, setUserPlan] = useState<"free" | "pro">("free");

  useEffect(() => {
    const checkPlan = async () => {
      const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
      if (localPlan) {
        setUserPlan(localPlan);
      }
      if (user) {
        try {
          const { data } = await supabase
            .from("user_subscriptions")
            .select("plan_id, status, current_period_end")
            .eq("user_id", user.id)
            .maybeSingle();
          if (data) {
            const isPro = data.plan_id === "pro" && (
              data.status === "active" ||
              (data.status === "canceled" && data.current_period_end && new Date(data.current_period_end) > new Date())
            );
            setUserPlan(isPro ? "pro" : "free");
          }
        } catch (e) {
          console.error(e);
        }
      }
    };
    checkPlan();
  }, [user]);

  const m =
    os === "mac"
      ? {
          name: "macOS",
          file: "Barosit-0.1.0.dmg",
          size: "38 MB",
          req: "macOS 12.0 (Monterey) 이상 · Apple Silicon · Intel",
          other: "Windows",
          otherUrl: "#/download/win",
          installSecond: "응용 프로그램 폴더로 옮겨요",
        }
      : {
          name: "Windows",
          file: "Barosit-Setup-0.1.0.exe",
          size: "42 MB",
          req: "Windows 10 64-bit 이상 · x64 · ARM64",
          other: "macOS",
          otherUrl: "#/download/mac",
          installSecond: "안내에 따라 설치해요",
        };

  const handleDownloadClick = () => {
    if (!user) {
      alert(
        "💡 데스크톱 전용 설치형 앱(Tauri)은 PRO 플랜 전용 혜택입니다.\n\n" +
        "다운로드 전 회원님의 플랜(FREE / PRO)을 확인하기 위해 로그인이 필요합니다.\n\n" +
        "확인을 누르시면 로그인 페이지로 이동합니다."
      );
      window.location.hash = "#/login";
      return;
    }

    if (userPlan !== "pro") {
      alert(
        "💡 데스크톱 전용 설치형 앱(Tauri)은 PRO 플랜 전용 혜택입니다.\n\n" +
        "현재 회원님은 FREE 플랜(웹 브라우저 전용)을 이용 중이십니다.\n" +
        "Free 회원은 언제든 웹 버전에서 평생 무료로 감지를 진행하실 수 있으며, " +
        "PRO 플랜으로 즉시 업그레이드하여 백그라운드 무정지 감지와 미니 위젯, 시스템 트레이 관제 혜택을 누릴 수 있습니다.\n\n" +
        "확인을 누르시면 가격/플랜 안내 페이지로 이동합니다."
      );
      window.location.hash = "#/pricing";
    } else {
      alert(`🎉 PRO 회원 인증 성공! ${m.name} 설치 프로그램(${m.file}) 다운로드를 시작합니다.`);
    }
  };

  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav active="다운로드" />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "70px 56px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 30 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              background: "var(--b-sig-bg)",
              border: "1px solid var(--b-sig-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Logo size={56} variant="filled" fill="var(--b-sig)" />
          </div>
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--b-sig)",
                letterSpacing: "0.08em",
                marginBottom: 6,
              }}
            >
              {m.name.toUpperCase()} 다운로드
            </div>
            <h1
              style={{
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: "-0.028em",
                marginBottom: 6,
                lineHeight: 1.15,
              }}
            >
              {m.name}용 Barosit
            </h1>
            <div className="b-num" style={{ fontSize: 13, color: "var(--b-fg-3)" }}>
              버전 0.1.0 · {m.size}
            </div>
          </div>
        </div>

        <button
          onClick={handleDownloadClick}
          className="b-btn b-btn-primary"
          style={{ height: 52, padding: "0 28px", fontSize: 15, marginBottom: 14 }}
        >
          <Icon name="arrow-r" size={15} /> {m.file} 다운로드
        </button>
        <div style={{ fontSize: 12, color: "var(--b-fg-4)", marginBottom: 36 }}>
          다운로드 시{" "}
          <a style={{ color: "var(--b-fg-3)", textDecoration: "underline" }}>
            이용약관
          </a>
          과{" "}
          <a style={{ color: "var(--b-fg-3)", textDecoration: "underline" }}>
            프라이버시 정책
          </a>
          에 동의하게 됩니다.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            marginBottom: 36,
          }}
        >
          <MiniCard title="시스템 요구사항" icon="cpu">
            <div style={{ fontSize: 13, color: "var(--b-fg-2)", lineHeight: 1.7 }}>
              {m.req}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--b-fg-3)",
                marginTop: 8,
                lineHeight: 1.6,
              }}
            >
              내장 카메라 또는 USB 웹캠 필요. 측면에서 잡히도록 두면 정확도가 가장
              높아요.
            </div>
          </MiniCard>
          <MiniCard title="설치 방법" icon="info">
            <ol
              style={{
                fontSize: 13,
                color: "var(--b-fg-2)",
                paddingLeft: 18,
                margin: 0,
                lineHeight: 1.8,
              }}
            >
              <li>다운로드한 파일을 열어요</li>
              <li>{m.installSecond}</li>
              <li>처음 실행 시 카메라 권한을 허용해요</li>
            </ol>
          </MiniCard>
        </div>

        <MiniCard title="0.1.0 — 첫 빌드" icon="sparkle">
          <ul
            style={{
              fontSize: 13,
              color: "var(--b-fg-2)",
              paddingLeft: 18,
              margin: 0,
              lineHeight: 1.8,
            }}
          >
            <li>자세 7종 감지 (거북목 · 턱 괴임 · 어깨 기울임 · 등 구부정 · 모니터 거리 · 어깨 비대칭 · 머리 갸우뚱)</li>
            <li>0–100 점수 시스템 + 스트레칭 보너스</li>
            <li>위젯 모드 (드래그·위치 저장)</li>
            <li>다크 모드 · 시그니처 sage</li>
          </ul>
          <a
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginTop: 12,
              fontSize: 12,
              color: "var(--b-sig)",
              fontWeight: 600,
            }}
          >
            전체 릴리스 노트 <Icon name="chev-r" size={11} />
          </a>
        </MiniCard>

        <div
          style={{
            marginTop: 30,
            padding: 24,
            borderRadius: 14,
            background: "var(--b-surface-2)",
            border: "1px solid var(--b-line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
              {m.other}를 쓰시나요?
            </div>
            <div style={{ fontSize: 12, color: "var(--b-fg-3)" }}>
              {m.other}용 빌드도 준비되어 있어요
            </div>
          </div>
          <a
            href={m.otherUrl}
            className="b-btn b-btn-ghost"
            style={{ textDecoration: "none" }}
          >
            {m.other} 버전 <Icon name="arrow-r" size={12} />
          </a>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ───────── Pricing ─────────

// 토스페이먼츠 SDK 동적 로더
function loadTossPayments(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("브라우저 환경이 아닙니다."));
      return;
    }
    if ((window as any).TossPayments) {
      resolve((window as any).TossPayments);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.tosspayments.com/v1";
    script.async = true;
    script.onload = () => {
      if ((window as any).TossPayments) {
        resolve((window as any).TossPayments);
      } else {
        reject(new Error("토스페이먼츠 SDK 로딩에 실패했습니다."));
      }
    };
    script.onerror = () => reject(new Error("토스페이먼츠 SDK를 불러오는 도중 에러가 발생했습니다."));
    document.head.appendChild(script);
  });
}

const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY || "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq";

function Pricing() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentPlan, setCurrentPlan] = useState<"free" | "pro">("free");
  
  // 결제 진행 상태: "idle" | "select_method" | "checkout" | "success"
  const [paymentState, setPaymentState] = useState<"idle" | "select_method" | "checkout" | "success">("idle");
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string; delay: number }[]>([]);

  useEffect(() => {
    // 요금제 페이지 뷰 노출 분석 이벤트 트리거
    trackPaymentEvent("pricing_view_loaded", { billingCycle });
  }, [billingCycle]);

  useEffect(() => {
    const fetchUserAndPlan = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userObj = session?.user || null;
        let actualPlan: "free" | "pro" = "free";

        if (userObj) {
          setCurrentUser(userObj);
          // 구독 조회
          const { data, error } = await supabase
            .from("user_subscriptions")
            .select("plan_id, status, current_period_end")
            .eq("user_id", userObj.id)
            .maybeSingle();

          if (!error && data) {
            const isPro = data.plan_id === "pro" && (
              data.status === "active" ||
              (data.status === "canceled" && data.current_period_end && new Date(data.current_period_end) > new Date())
            );
            actualPlan = isPro ? "pro" : "free";
          } else {
            // RLS 에러 등으로 조회 불가능하거나 없는 경우 안전하게 로컬 캐시 기준 판단하되 free가 기본값
            const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
            actualPlan = localPlan || "free";
          }

          const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";

          // [보안강화] DB 분석 상태 기준 로컬스토리지를 강제 Overwrite 및 위변조 감지
          if (actualPlan === "free" && localPlan === "pro") {
            console.warn("Security Warning: Subscription plan tampering detected in Marketing Pricing!");
            
            // 1. admin_notifications 테이블에 critical 경보 적재
            await supabase.from("admin_notifications").insert({
              event_type: "tampering_detected",
              severity: "critical",
              message: `보안 침해 감지 (마케팅): 사용자 ${userObj.email} 님이 요금제 진입 시 로컬 요금제 캐시를 PRO로 불법 변조한 정황이 포착되어, 시스템이 권한을 격하하고 로그를 기록했습니다.`,
              payload: {
                user_id: userObj.id,
                email: userObj.email,
                local_plan: "pro",
                db_plan: "free",
                detected_at: new Date().toISOString()
              }
            });

            // 2. 강제 롤백
            localStorage.setItem("barosit:subscription_plan", "free");
            setCurrentPlan("free");
            window.dispatchEvent(new Event("barosit:subscription-changed"));
          } else {
            localStorage.setItem("barosit:subscription_plan", actualPlan);
            setCurrentPlan(actualPlan);
          }

          // 로그인 성공 복귀 후 대기 중이던 결제 복구 실행
          const pendingSub = localStorage.getItem("barosit:pending_subscription");
          if (pendingSub === "true" && actualPlan !== "pro") {
            localStorage.removeItem("barosit:pending_subscription");
            const pendingCycle = localStorage.getItem("barosit:pending_subscription_cycle") as "monthly" | "yearly";
            localStorage.removeItem("barosit:pending_subscription_cycle");
            if (pendingCycle) {
              setBillingCycle(pendingCycle);
            }
            setTimeout(() => {
              handleTossPayment("카드", userObj, pendingCycle);
            }, 150);
          }
        } else {
          // [보안강화] 비로그인 Guest일 시 로컬스토리지를 강제로 'free'로 격하하여 우회 공격 완전 차단
          localStorage.setItem("barosit:subscription_plan", "free");
          setCurrentPlan("free");
        }

        // Toss Payments 결제 복원 핸들링
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const paymentStatus = params.get("payment");
          const authKey = params.get("authKey");
          if (paymentStatus === "success") {
            setPaymentState("checkout");
            const cycleParam = params.get("cycle") as "monthly" | "yearly" || "monthly";
            const finalAmount = cycleParam === "yearly" ? 36000 : 4900;
            
            setTimeout(async () => {
              try {
                if (userObj) {
                  // DB 업데이트 (결제 주기에 따라 만료 기한 연장 설정)
                  const periodEnd = new Date();
                  if (cycleParam === "yearly") {
                    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
                  } else {
                    periodEnd.setMonth(periodEnd.getMonth() + 1);
                  }

                  const { error } = await supabase
                    .from("user_subscriptions")
                    .upsert({
                      user_id: userObj.id,
                      plan_id: "pro",
                      status: "active",
                      billing_key: authKey || `mock_billing_key_${Date.now()}`,
                      current_period_end: periodEnd.toISOString(),
                      updated_at: new Date().toISOString()
                    }, { onConflict: "user_id" });
                  if (error) {
                    console.warn("DB subscription upsert failed (possibly RLS), activating locally.", error);
                  }

                  // 결제 완료 이력 기입
                  const mockOrderId = `order-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                  const mockPaymentKey = authKey || `mock_pay_key_${Date.now()}`;
                  const { error: historyError } = await supabase
                    .from("billing_history")
                    .insert({
                      user_id: userObj.id,
                      kind: "payment",
                      order_id: mockOrderId,
                      payment_key: mockPaymentKey,
                      amount: finalAmount,
                      plan: "pro",
                      billing_cycle: cycleParam,
                      status: "completed",
                      cash_receipt_issued: false,
                      created_at: new Date().toISOString()
                    });
                  if (historyError) {
                    console.warn("DB billing_history insert failed:", historyError);
                  }
                }
                
                // 로컬 구독 등급 즉시 갱신 동기화 및 트리거 이벤트 로깅
                localStorage.setItem("barosit:subscription_plan", "pro");
                setCurrentPlan("pro");
                setPaymentState("success");
                triggerConfetti();
                
                // 결제 성공 분석 이벤트 전송
                trackPaymentEvent("checkout_completed", {
                  billingCycle: cycleParam,
                  amount: finalAmount,
                  user: userObj?.email
                });

                const cleanUrl = window.location.origin + window.location.pathname + "#/pricing";
                window.history.replaceState({}, document.title, cleanUrl);
              } catch (e) {
                console.error("DB update error", e);
                localStorage.setItem("barosit:subscription_plan", "pro");
                setCurrentPlan("pro");
                setPaymentState("success");
                triggerConfetti();

                trackPaymentEvent("checkout_completed", {
                  billingCycle: cycleParam,
                  amount: finalAmount,
                  user: userObj?.email,
                  error: "DB sync exception but local activated"
                });
                
                const cleanUrl = window.location.origin + window.location.pathname + "#/pricing";
                window.history.replaceState({}, document.title, cleanUrl);
              }
            }, 1200);
          } else if (paymentStatus === "fail") {
            // 결제 실패 분석 이벤트 전송
            trackPaymentEvent("checkout_failed", {
              reason: "paymentStatus is fail from query param",
              user: userObj?.email
            });

            // admin_notifications 테이블에 warning 알림 적재
            await supabase.from("admin_notifications").insert({
              event_type: "payment_failed",
              severity: "warning",
              message: `결제 실패: 사용자 ${userObj?.email || "비회원"} 님의 토스페이 결제 승인이 거절되거나 실패했습니다. (마케팅 화면 쿼리 수신)`,
              payload: {
                user_id: userObj?.id || null,
                email: userObj?.email || null,
                reason: "paymentStatus is fail from redirect query",
                failed_at: new Date().toISOString()
              }
            });

            alert("결제에 실패하였습니다. 다시 시도해주세요.");
            const cleanUrl = window.location.origin + window.location.pathname + "#/pricing";
            window.history.replaceState({}, document.title, cleanUrl);
            setPaymentState("idle");
          }
        }
      } catch (err) {
        console.error("Failed to load user or subscription status:", err);
      }
    };
    fetchUserAndPlan();
  }, []);

  const triggerConfetti = () => {
    const colors = ["#7eb09c", "#a3cdbb", "#ebdcb9", "#ebd2b9", "#ebd2c8", "#5b8c7a", "#ffeedb"];
    const newParticles = Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100 - 50, // center offset x
      y: Math.random() * 100 - 50, // center offset y
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.4,
    }));
    setParticles(newParticles);
  };

  const handleUpgradeToPro = async () => {
    if (currentPlan === "pro") return;

    if (!currentUser) {
      // 로그인되어 있지 않은 상태: 로그인 페이지로 리다이렉트 및 로그인 성공 시 복귀 설정
      localStorage.setItem("barosit:auth_redirect", "#/pricing");
      localStorage.setItem("barosit:pending_subscription", "true");
      localStorage.setItem("barosit:pending_subscription_cycle", billingCycle);
      window.location.hash = "#/login";
      return;
    }

    // 중간 선택 단계 없이 바로 토스 통합 결제창 요청 실행
    await handleTossPayment("CARD" as any);
  };

  const handleTossPayment = async (
    _method: "카드" | "토스페이",
    userOverride?: any,
    cycleOverride?: "monthly" | "yearly"
  ) => {
    setPaymentState("checkout");
    const activeUser = userOverride || currentUser;
    const activeCycle = cycleOverride || billingCycle;
    const amount = activeCycle === "yearly" ? 36000 : 4900;

    // 정기 결제 카드 등록 시도 로깅
    trackPaymentEvent("checkout_initiated", {
      billingCycle: activeCycle,
      amount,
      method: "카드(정기결제)",
      user: activeUser?.email
    });

    try {
      const TossPaymentsLib = await loadTossPayments();
      const toss = TossPaymentsLib(TOSS_CLIENT_KEY);
      
      const customerKey = activeUser
        ? `cust-${activeUser.id.substring(0, 8)}-${Math.random().toString(36).substring(2, 7)}`
        : `cust-guest-${Math.random().toString(36).substring(2, 10)}`;

      // 정기 구독 결제를 위한 카드 등록 창(requestBillingAuth) 실행
      await toss.requestBillingAuth("카드", {
        customerKey,
        successUrl: window.location.origin + window.location.pathname + `?redirect_route=pricing&payment=success&cycle=${activeCycle}`,
        failUrl: window.location.origin + window.location.pathname + `?redirect_route=pricing&payment=fail`,
      });
    } catch (err: any) {
      // 결제창 실행 오류 분석 이벤트 로깅
      trackPaymentEvent("checkout_failed", {
        reason: err.message,
        user: activeUser?.email
      });

      // admin_notifications 테이블에 warning 알림 적재
      await supabase.from("admin_notifications").insert({
        event_type: "payment_failed",
        severity: "warning",
        message: `결제 실패 (SDK): 사용자 ${activeUser?.email || "비회원"} 님의 결제창 호출 혹은 진행 중 오류가 발생했습니다: ${err.message}`,
        payload: {
          user_id: activeUser?.id || null,
          email: activeUser?.email || null,
          reason: err.message,
          failed_at: new Date().toISOString()
        }
      });

      alert("결제창을 실행하는 중 오류가 발생했습니다: " + err.message);
      setPaymentState("idle");
    }
  };

  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh", position: "relative" }}>
      <TopNav active="가격" />
      
      <style>{`
        /* Checkout Spinner Overlay */
        .checkout-loading-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 18, 20, 0.95);
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 20px;
          backdrop-filter: blur(10px);
          WebkitBackdropFilter: blur(10px);
        }
        .spinner {
          width: 48px;
          height: 48px;
          border: 3px solid rgba(126, 176, 156, 0.1);
          border-top-color: #7eb09c;
          border-radius: 50%;
          animation: spin 1s infinite linear;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Success & Celebration */
        .checkout-success-view {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 60px 24px;
          position: relative;
          max-width: 600px;
          margin: 0 auto;
          animation: pricingScaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes pricingScaleIn {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .success-circle {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: rgba(126, 176, 156, 0.1);
          border: 2px solid #7eb09c;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #7eb09c;
          margin-bottom: 24px;
          font-size: 36px;
          animation: successPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }
        @keyframes successPop {
          0% { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .success-headline {
          font-size: 28px;
          font-weight: 800;
          margin: 0 0 12px;
          color: #fff;
        }
        .success-desc {
          font-size: 15px;
          color: var(--b-fg-2);
          line-height: 1.6;
          max-width: 480px;
          margin: 0 0 40px;
        }

        /* Download Boxes */
        .download-boxes {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          width: 100%;
          max-width: 500px;
          margin-bottom: 32px;
        }
        .download-box {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 24px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-decoration: none;
          color: inherit;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s, transform 0.15s;
        }
        .download-box:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(126, 176, 156, 0.4);
          transform: translateY(-2px);
        }
        .download-box:active {
          transform: translateY(0);
        }
        .download-os-name {
          font-size: 14px;
          font-weight: 700;
          margin: 12px 0 4px;
          color: #fff;
        }
        .download-btn-label {
          font-size: 12px;
          color: #7eb09c;
          font-weight: 600;
        }

        /* CSS Confetti Sparkles */
        .confetti-sparkle {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 3px;
          top: 30%;
          left: 50%;
          opacity: 0;
          pointer-events: none;
          animation: floatSparkle 1.8s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
        }
        @keyframes floatSparkle {
          0% {
            transform: translate(0, 0) scale(1) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translate(var(--tx), var(--ty)) scale(0.2) rotate(360deg);
            opacity: 0;
          }
        }
      `}</style>

      {/* 1. 가상 결제 승인 중 화면 */}
      {paymentState === "checkout" && (
        <div className="checkout-loading-overlay">
          <div className="spinner" />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#fff" }}>
              결제 승인 진행 중
            </div>
            <div style={{ fontSize: 13, color: "var(--b-fg-3)" }}>
              가상의 모의 결제 요청을 안전하게 승인하고 있습니다...
            </div>
          </div>
        </div>
      )}



      {/* 3. 결제 완료 축하 및 성공 다운로드 화면 */}
      {paymentState === "success" ? (
        <div className="checkout-success-view">
          {particles.map((p) => (
            <div
              key={p.id}
              className="confetti-sparkle"
              style={{
                background: p.color,
                "--tx": `${p.x}vw`,
                "--ty": `${p.y}vh`,
                animationDelay: `${p.delay}s`,
              } as any}
            />
          ))}

          <div className="success-circle">
            <Icon name="check" size={36} />
          </div>

          <h2 className="success-headline">PRO 구독이 시작되었습니다!</h2>
          <p className="success-desc">
            가상 결제가 성공적으로 완료되었습니다. 이제 백그라운드 모니터링, 네이티브 알림, 
            그리고 데스크톱 미니 위젯 등 BaroSit PRO의 모든 막강한 혜택을 제한 없이 누려보세요!
          </p>

          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--b-fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "16px" }}>
            데스크톱 전용 앱 다운로드
          </div>

          <div className="download-boxes">
            <a href="#/download/mac" className="download-box">
              <Icon name="sparkle" size={32} style={{ color: "#7eb09c" }} />
              <div className="download-os-name">macOS Apple Silicon</div>
              <div className="download-btn-label">PRO 빌드 즉시 다운로드</div>
            </a>
            <a href="#/download/win" className="download-box">
              <Icon name="cpu" size={32} style={{ color: "#e08866" }} />
              <div className="download-os-name">Windows x64</div>
              <div className="download-btn-label">PRO 빌드 즉시 다운로드</div>
            </a>
          </div>

          <button
            type="button"
            className="b-btn b-btn-primary"
            style={{ height: "46px", padding: "0 28px", fontSize: "14px", borderRadius: "12px" }}
            onClick={() => {
              setPaymentState("idle");
              window.location.hash = "#/landing";
            }}
          >
            메인 페이지로 가기
          </button>
        </div>
      ) : (
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "70px 56px" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h1
              style={{
                fontSize: 48,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                marginBottom: 14,
                lineHeight: 1.1,
              }}
            >
              간단한 가격, 평생 무료 시작
            </h1>
            <p style={{ fontSize: 16, color: "var(--b-fg-2)", marginBottom: 32 }}>
              자세 감지의 핵심은 평생 무료입니다. Pro는 다기기 동기화와 리포트만
              추가해요.
            </p>

            {/* 결제 주기 토글 스위치 */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <div
                style={{
                  background: "var(--b-surface-2)",
                  border: "1px solid var(--b-line)",
                  padding: 4,
                  borderRadius: 999,
                  display: "flex",
                  gap: 4,
                }}
              >
                <button
                  type="button"
                  onClick={() => setBillingCycle("monthly")}
                  style={{
                    border: "none",
                    background: billingCycle === "monthly" ? "var(--b-sig-bg)" : "transparent",
                    color: billingCycle === "monthly" ? "var(--b-sig)" : "var(--b-fg-3)",
                    padding: "8px 20px",
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: 999,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  월간 결제
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle("yearly")}
                  style={{
                    border: "none",
                    background: billingCycle === "yearly" ? "var(--b-sig-bg)" : "transparent",
                    color: billingCycle === "yearly" ? "var(--b-sig)" : "var(--b-fg-3)",
                    padding: "8px 20px",
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: 999,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  연간 결제
                  <span
                    style={{
                      background: "var(--b-sig)",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "1px 6px",
                      borderRadius: 999,
                    }}
                  >
                    연 38% 할인 🔥
                  </span>
                </button>
              </div>
            </div>
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              {
                name: "Free",
                price: "0원",
                sub: "평생 무료 (웹 브라우저 전용)",
                feats: [
                  "7종 핵심 실시간 자세 감지",
                  "실시간 웹 화면 경고 피드백",
                  "온디바이스 실루엣 프라이버시 필터",
                  "바른 자세 스트레칭 복구 가이드",
                  "제약: 백그라운드 모니터링 불가",
                  "제약: 미니 데스크톱 위젯 모드 불가",
                ],
                cta: "무료로 시작",
                primary: false,
              },
              {
                name: "Pro",
                price: billingCycle === "yearly" ? "연 36,000원" : "월 4,900원",
                sub: billingCycle === "yearly" ? "연간 결제 (월 3,000원 꼴)" : "매월 정기 결제",
                feats: [
                  "Free의 모든 기능 기본 포함",
                  "완벽한 백그라운드 모니터링 (Tauri 앱)",
                  "OS 네이티브 푸시 알림 & 트레이 이모지 관제",
                  "화면 구석에 띄우는 미니 데스크톱 위젯 모드",
                  "90일 자세 정밀 캘린더 분석 및 차트",
                  "다중 기기 실시간 설정 및 이력 동기화",
                ],
                cta: currentPlan === "pro" ? "현재 이용 중인 플랜" : "Pro 시작하기",
                primary: true,
              },
            ].map((p, i) => (
              <div
                key={i}
                style={{
                  padding: 32,
                  borderRadius: 18,
                  background: p.primary ? "var(--b-sig-bg)" : "var(--b-surface)",
                  border: "1px solid",
                  borderColor: p.primary ? "var(--b-sig)" : "var(--b-line)",
                  position: "relative",
                }}
              >
                {p.primary && (
                  <span
                    style={{
                      position: "absolute",
                      top: -10,
                      right: 20,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "var(--b-sig)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                    }}
                  >
                    추천
                  </span>
                )}
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                  {p.name}
                </div>
                <div
                  style={{
                    fontSize: 40,
                    fontWeight: 700,
                    letterSpacing: "-0.028em",
                    lineHeight: 1.1,
                    marginBottom: 4,
                  }}
                >
                  {p.price}
                </div>
                <div style={{ fontSize: 12, color: "var(--b-fg-3)", marginBottom: 24 }}>
                  {p.sub}
                </div>
                
                {p.primary ? (
                  <button
                    type="button"
                    onClick={handleUpgradeToPro}
                    className={`b-btn ${currentPlan === "pro" ? "b-btn-ghost" : "b-btn-primary"}`}
                    disabled={currentPlan === "pro"}
                    style={{
                      width: "100%",
                      justifyContent: "center",
                      height: 44,
                      fontSize: 14,
                      marginBottom: 24,
                    }}
                  >
                    {p.cta}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="b-btn b-btn-ghost"
                    disabled
                    style={{
                      width: "100%",
                      justifyContent: "center",
                      height: 44,
                      fontSize: 14,
                      marginBottom: 24,
                      opacity: 0.5,
                      cursor: "default"
                    }}
                  >
                    {p.cta}
                  </button>
                )}
                
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {p.feats.map((f, j) => (
                    <div
                      key={j}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                        color: "var(--b-fg-2)",
                      }}
                    >
                      <Icon
                        name="check"
                        size={14}
                        style={{ color: "var(--b-sig)", flexShrink: 0 }}
                      />
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Footer />
    </div>
  );
}

// ───────── Profile ─────────

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--b-fg-3)",
          letterSpacing: "0.04em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          padding: "10px 12px",
          minHeight: 42,
          border: "1px solid var(--b-line)",
          borderRadius: 8,
          background: "var(--b-surface-2)",
          color: "var(--b-fg-1)",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
        }}
      >
        {value || <span style={{ color: "var(--b-fg-4)" }}>—</span>}
      </div>
    </div>
  );
}

function AccountTab({
  user,
  subPlan,
}: {
  user: import("@supabase/supabase-js").User | null;
  subPlan: "free" | "pro";
}) {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    "";
  const avatarUrl = (meta.avatar_url as string | undefined) ?? null;
  const provider =
    ((user?.app_metadata as Record<string, unknown> | undefined)?.provider as
      | string
      | undefined) ?? "—";
  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("ko-KR")
    : "—";
  const initial = (fullName || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <>
      <h2
        style={{
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: "-0.022em",
          marginBottom: 6,
        }}
      >
        계정
      </h2>
      <p style={{ fontSize: 13, color: "var(--b-fg-3)", marginBottom: 28 }}>
        소셜 로그인 정보를 보여드려요. 표시 이름·아바타 편집은 곧 지원할 예정이에요.
      </p>

      <div
        style={{
          padding: 24,
          borderRadius: 14,
          background: "var(--b-surface)",
          border: "1px solid var(--b-line)",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
          <Avatar size={72} initial={initial} imageUrl={avatarUrl} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: "-0.012em",
                marginBottom: 4,
              }}
            >
              {fullName || user?.email || "사용자"}
            </div>
            <div style={{ fontSize: 12, color: "var(--b-fg-3)" }}>
              {provider === "google"
                ? "Google 로 로그인됨"
                : provider === "—"
                  ? "로그인 정보 없음"
                  : `${provider} 로 로그인됨`}
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 999,
                background:
                  subPlan === "pro"
                    ? "linear-gradient(135deg, #7eb09c 0%, #5b8c7a 100%)"
                    : "var(--b-surface-2)",
                color: subPlan === "pro" ? "#fff" : "var(--b-fg-2)",
                fontSize: 12,
                fontWeight: 700,
                boxShadow:
                  subPlan === "pro"
                    ? "0 2px 8px rgba(126, 176, 156, 0.25)"
                    : "none",
              }}
            >
              {subPlan === "pro" ? "PRO" : "FREE"}
            </span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <ReadOnlyField label="표시 이름" value={fullName} />
          <ReadOnlyField label="이메일" value={user?.email ?? ""} />
          <ReadOnlyField label="로그인 방식" value={provider} />
          <ReadOnlyField label="가입일" value={createdAt} />
        </div>
      </div>

      <div
        style={{
          padding: 20,
          borderRadius: 14,
          background: "var(--b-surface-2)",
          border: "1px solid var(--b-line)",
          fontSize: 12,
          color: "var(--b-fg-3)",
          lineHeight: 1.6,
        }}
      >
        BaroSit 은 비밀번호 가입을 사용하지 않습니다. 소셜 로그인 또는 이메일 매직링크로
        로그인하세요. 계정 삭제·데이터 내려받기는{" "}
        <a
          href="#/contact"
          style={{ color: "var(--b-sig-deep)", textDecoration: "underline" }}
        >
          문의
        </a>
        로 요청 주시면 처리해드립니다.
      </div>
    </>
  );
}

function PlanTab({
  subPlan,
  planId,
  subStatus,
  periodEnd,
  onUpdateSubscription,
}: {
  subPlan: "free" | "pro";
  planId: "pro_monthly" | "pro_yearly" | "pro" | "free";
  subStatus: "active" | "canceled" | "none";
  periodEnd: string | null;
  onUpdateSubscription: () => void;
}) {
  const { user } = useAuth();
  const [billingHistory, setBillingHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [latestPayment, setLatestPayment] = useState<any>(null);
  const [isRefundable, setIsRefundable] = useState(false);

  useEffect(() => {
    const fetchHistoryAndRefundStatus = async () => {
      if (!user) return;
      try {
        setLoadingHistory(true);
        // 결제 내역 조회
        const { data: history, error } = await supabase
          .from("billing_history")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (!error && history) {
          setBillingHistory(history);
          
          // completed payment 찾기
          const lastPay = history.find(r => r.kind === "payment" && r.status === "completed");
          if (lastPay) {
            setLatestPayment(lastPay);
            
            // 결제한 지 7일 이내인지 판단
            const isWithin7Days = new Date().getTime() - new Date(lastPay.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000;
            if (isWithin7Days) {
              // posture_events와 daily_scores에 결제 시각 이후 기록이 존재하는지 판별
              const { count: eventCount } = await supabase
                .from("posture_events")
                .select("*", { count: "exact", head: true })
                .eq("user_id", user.id)
                .gte("created_at", lastPay.created_at);

              const { count: scoreCount } = await supabase
                .from("daily_scores")
                .select("*", { count: "exact", head: true })
                .eq("user_id", user.id)
                .gte("created_at", lastPay.created_at);

              if ((eventCount === 0 || eventCount === null) && (scoreCount === 0 || scoreCount === null)) {
                setIsRefundable(true);
              } else {
                setIsRefundable(false);
              }
            } else {
              setIsRefundable(false);
            }
          } else {
            setLatestPayment(null);
            setIsRefundable(false);
          }
        }
      } catch (err) {
        console.error("Failed to load billing history or refund status:", err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistoryAndRefundStatus();
  }, [user, subPlan, subStatus]);

  // 결제 정보 변경 감지 및 카드 갱신 결과 처리
  useEffect(() => {
    const checkCardUpdateResult = async () => {
      if (typeof window === "undefined" || !user) return;
      const params = new URLSearchParams(window.location.search);
      const paymentStatus = params.get("payment");
      const action = params.get("action");
      const authKey = params.get("authKey");

      if (action === "update_card") {
        // Clean query parameters to avoid double processing on page refresh
        const cleanUrl = window.location.origin + window.location.pathname + "#/profile";
        window.history.replaceState({}, document.title, cleanUrl);

        if (paymentStatus === "success" && authKey) {
          try {
            // 1. user_subscriptions 테이블의 billing_key 업데이트
            const { error: subError } = await supabase
              .from("user_subscriptions")
              .update({
                billing_key: authKey,
                updated_at: new Date().toISOString()
              })
              .eq("user_id", user.id);

            if (subError) throw subError;

            // 2. billing_history 테이블에 결제수단 변경(card_updated) 이력 기록
            const mockOrderId = `card-update-${Date.now()}`;
            const { error: historyError } = await supabase
              .from("billing_history")
              .insert({
                user_id: user.id,
                kind: "card_updated",
                order_id: mockOrderId,
                payment_key: authKey,
                amount: 0,
                plan: "pro",
                billing_cycle: planId === "pro_yearly" ? "yearly" : "monthly",
                status: "completed",
                cash_receipt_issued: false,
                created_at: new Date().toISOString()
              });

            if (historyError) throw historyError;

            // 3. admin_notifications 테이블에 관리자 공지 적재
            await supabase.from("admin_notifications").insert({
              event_type: "signup",
              severity: "info",
              message: `결제 정보 변경: 사용자 ${user.email} 님이 대표 청구용 신용카드를 신규 카드로 성공적으로 갱신/변경하였습니다.`,
              payload: {
                user_id: user.id,
                email: user.email,
                action: "card_renewal",
                updated_at: new Date().toISOString()
              }
            });

            window.alert("🎉 결제 카드가 성공적으로 변경 및 갱신되었습니다!");
            onUpdateSubscription();
          } catch (err) {
            console.error("Failed to update card:", err);
            window.alert("결제 카드 정보 변경 중 문제가 발생했습니다.");
          }
        } else if (paymentStatus === "fail") {
          // 결제수단 변경 실패 알림 적재
          await supabase.from("admin_notifications").insert({
            event_type: "payment_failed",
            severity: "warning",
            message: `결제수단 변경 실패: 사용자 ${user.email} 님의 신규 결제 카드 등록이 실패하거나 본인 인증이 중단되었습니다.`,
            payload: {
              user_id: user.id,
              email: user.email,
              action: "card_renewal_failed",
              failed_at: new Date().toISOString()
            }
          });
          window.alert("결제 카드 등록이 중단되었거나 실패했습니다. 다시 시도해 주세요.");
        }
      }
    };

    checkCardUpdateResult();
  }, [user, subPlan, subStatus]);

  // 실제 결제 수단 변경 및 카드 갱신 신청 로직
  const handleUpdatePaymentCard = async () => {
    if (!user) return;
    try {
      const TossPaymentsLib = await loadTossPayments();
      const toss = TossPaymentsLib(TOSS_CLIENT_KEY);
      
      const customerKey = `cust-${user.id.substring(0, 8)}-${Math.random().toString(36).substring(2, 7)}`;
      
      trackPaymentEvent("card_update_initiated", {
        user: user.email
      });

      await toss.requestBillingAuth("카드", {
        customerKey,
        successUrl: window.location.origin + window.location.pathname + `?redirect_route=profile&payment=success&action=update_card`,
        failUrl: window.location.origin + window.location.pathname + `?redirect_route=profile&payment=fail&action=update_card`,
      });
    } catch (err: any) {
      trackPaymentEvent("card_update_failed", {
        reason: err.message,
        user: user.email
      });
      alert("카드 등록창을 호출하는 중 오류가 발생했습니다: " + err.message);
    }
  };

  // 플랜 취소 신청
  const handleCancelSubscription = async () => {
    if (!user) return;
    
    trackPaymentEvent("subscription_cancel_initiated");

    const formattedDate = periodEnd ? new Date(periodEnd).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }) : "다음 결제일";

    const confirmCancel = window.confirm(
      `구독을 취소하시겠습니까?\n\n취소하시더라도 이번 결제 주기 만료일인 ${formattedDate}까지는 PRO 플랜의 모든 프리미엄 기능(데스크톱 앱 백그라운드 무정지 모니터링, AI 코칭 등)을 계속 정상 이용하실 수 있습니다.\n이후 추가 결제 없이 FREE 플랜으로 안전하게 자동 전환됩니다.`
    );

    if (confirmCancel) {
      try {
        const { error } = await supabase
          .from("user_subscriptions")
          .update({
            status: "canceled",
            updated_at: new Date().toISOString()
          })
          .eq("user_id", user.id);

        if (!error) {
          trackPaymentEvent("subscription_cancel_confirmed");
          window.alert("구독 취소(해지) 신청이 성공적으로 완료되었습니다. 남은 기간 동안은 PRO 혜택이 정상 유지됩니다.");
          onUpdateSubscription();
        } else {
          console.error("Cancel subscription error:", error);
          window.alert("구독 취소 중 오류가 발생했습니다. 고객센터(support@barosit.com)로 문의주시면 신속히 처리해 드리겠습니다.");
        }
      } catch (err) {
        console.error(err);
        window.alert("구독 취소 중 오류가 발생했습니다.");
      }
    }
  };

  // 구독 취소 철회 (구독 계속 유지)
  const handleResumeSubscription = async () => {
    if (!user) return;

    const confirmResume = window.confirm(
      "구독 취소 신청을 철회하고 PRO 플랜 구독을 계속 유지하시겠습니까?\n이전과 동일하게 만료일에 자동으로 결제 및 기간 연장이 수행됩니다."
    );

    if (confirmResume) {
      try {
        const { error } = await supabase
          .from("user_subscriptions")
          .update({
            status: "active",
            updated_at: new Date().toISOString()
          })
          .eq("user_id", user.id);

        if (!error) {
          trackPaymentEvent("subscription_resume_confirmed");
          window.alert("구독 취소 신청이 성공적으로 철회되었습니다. PRO 플랜 구독을 계속 유지합니다!");
          onUpdateSubscription();
        } else {
          console.error("Resume subscription error:", error);
          window.alert("구독 재개 중 오류가 발생했습니다.");
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleImmediateRefund = async () => {
    if (!user || !latestPayment) return;
    const confirmRefund = window.confirm(
      "정말로 결제를 즉시 취소하고 전액 환불을 신청하시겠습니까?\n\n환불이 완료되면 즉시 PRO 등급에서 FREE 등급으로 강등되며 백그라운드 모니터링 및 모든 프리미엄 혜택 이용이 불가능해집니다."
    );
    if (!confirmRefund) return;

    try {
      const { error: subError } = await supabase
        .from("user_subscriptions")
        .update({
          plan_id: "free",
          status: "none",
          current_period_end: null,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", user.id);

      if (subError) throw subError;

      const { error: historyError } = await supabase
        .from("billing_history")
        .update({
          status: "refunded",
          refunded_amount: latestPayment.amount,
          updated_at: new Date().toISOString()
        })
        .eq("id", latestPayment.id);

      if (historyError) throw historyError;

      await supabase
        .from("billing_history")
        .insert({
          user_id: user.id,
          kind: "refund",
          order_id: latestPayment.order_id,
          payment_key: latestPayment.payment_key,
          amount: latestPayment.amount,
          plan: latestPayment.plan,
          billing_cycle: latestPayment.billing_cycle,
          status: "completed",
          cash_receipt_issued: false,
          refunded_amount: latestPayment.amount,
          created_at: new Date().toISOString()
        });

      localStorage.setItem("barosit:subscription_plan", "free");
      window.alert("즉시 환불 및 결제 취소가 완료되었습니다. 이용해 주셔서 감사합니다.");
      onUpdateSubscription();
    } catch (err) {
      console.error("Refund error:", err);
      window.alert("환불 처리 중 문제가 발생했습니다. 고객센터(support@barosit.com)로 문의주시면 신속히 확인하여 도와드리겠습니다.");
    }
  };

  // 모의 테스트 결제 수단 / 주기 변경 알림
  const handleMockNotice = () => {
    window.alert(
      "현재 결제 연동은 통합 모의 테스트 상태입니다.\n결제 주기 전환은 고객센터(support@barosit.com)를 통해 수동으로 즉시 안전하게 처리해 드리고 있습니다. 메일 주시면 신속히 도와드리겠습니다!"
    );
  };

  if (subPlan === "pro") {
    const isCanceled = subStatus === "canceled";
    const formattedDate = periodEnd ? new Date(periodEnd).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }) : "2026년 6월 11일";

    const isYearly = planId === "pro_yearly";
    const planPriceText = isYearly ? "연 36,000원" : "월 4,900원";
    const planPeriodText = isCanceled
      ? `구독 해지 예정일 · ${formattedDate} (만료 후 FREE 등급 자동 전환)`
      : isYearly
        ? `다음 결제일 · ${formattedDate} (연간 결제 - 월 3,000원 꼴)`
        : `다음 결제일 · ${formattedDate} (월간 결제)`;

    return (
      <>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.022em",
            marginBottom: 6,
          }}
        >
          플랜과 결제
        </h2>
        <p style={{ fontSize: 13, color: "var(--b-fg-3)", marginBottom: 28 }}>
          구독 상태와 결제 수단을 관리합니다.
        </p>

        <div
          style={{
            padding: 24,
            borderRadius: 14,
            marginBottom: 14,
            background: isCanceled
              ? "linear-gradient(135deg, var(--b-surface-2) 0%, var(--b-bg) 100%)"
              : "linear-gradient(135deg, var(--b-sig-bg) 0%, var(--b-bg) 100%)",
            border: isCanceled
              ? "1px solid var(--b-line)"
              : "1px solid var(--b-sig-soft)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              {isCanceled ? (
                <span
                  className="b-chip"
                  style={{
                    background: "rgba(224, 102, 102, 0.1)",
                    color: "rgb(224, 102, 102)",
                    borderColor: "rgba(224, 102, 102, 0.2)",
                    marginBottom: 12,
                    fontWeight: 600,
                  }}
                >
                  구독 해지 대기 중 (PRO 혜택 활성)
                </span>
              ) : (
                <span
                  className="b-chip"
                  style={{
                    background: "var(--b-sig)",
                    color: "#fff",
                    borderColor: "transparent",
                    marginBottom: 12,
                  }}
                >
                  현재 플랜 · PRO
                </span>
              )}
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: "-0.024em",
                  marginBottom: 4,
                  marginTop: 12,
                }}
              >
                {planPriceText}
              </div>
              <div style={{ fontSize: 13, color: isCanceled ? "rgb(224, 102, 102)" : "var(--b-fg-3)" }}>
                {planPeriodText}
              </div>
            </div>
            {!isCanceled && (
              <button onClick={handleUpdatePaymentCard} className="b-btn b-btn-ghost">결제수단 변경</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 18, alignItems: "center" }}>
            {isCanceled ? (
              <button
                onClick={handleResumeSubscription}
                className="b-btn b-btn-primary"
                style={{
                  background: "linear-gradient(135deg, var(--b-sig) 0%, var(--b-sig-deep) 100%)",
                  color: "#fff",
                  border: "none",
                  fontWeight: 700,
                }}
              >
                구독 계속 유지하기 (해지 철회)
              </button>
            ) : (
              <>
                <button onClick={handleMockNotice} className="b-btn b-btn-ghost" style={{ color: "var(--b-fg-3)" }}>
                  {isYearly ? "월간으로 변경 (월 4,900원)" : "연간으로 변경 (연 36,000원)"}
                </button>
                {isRefundable && latestPayment && (
                  <button
                    onClick={handleImmediateRefund}
                    className="b-btn b-btn-quiet"
                    style={{
                      background: "rgba(224, 102, 102, 0.08)",
                      color: "rgb(224, 102, 102)",
                      border: "1px solid rgba(224, 102, 102, 0.2)",
                      fontWeight: 600,
                      padding: "8px 14px",
                      borderRadius: 8
                    }}
                  >
                    즉시 환불 및 결제 취소
                  </button>
                )}
                <button onClick={handleCancelSubscription} className="b-btn b-btn-quiet" style={{ color: "var(--b-warn)" }}>
                  플랜 취소
                </button>
              </>
            )}
          </div>
        </div>

        <div
          style={{
            padding: 24,
            borderRadius: 14,
            background: "var(--b-surface)",
            border: "1px solid var(--b-line)",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>이번 달 사용</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              { k: "모니터링 시간", v: "128h", s: "+12% 지난 달" },
              { k: "활성 일수", v: "24일", s: "한 달 중" },
              { k: "평균 점수", v: "78", s: "+6 지난 달" },
            ].map((u, i) => (
              <div key={i}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--b-fg-3)",
                    letterSpacing: "0.04em",
                    marginBottom: 6,
                  }}
                >
                  {u.k}
                </div>
                <div
                  className="b-num"
                  style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.022em" }}
                >
                  {u.v}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--b-sig)",
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {u.s}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "0 4px" }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--b-fg-3)",
              letterSpacing: "0.08em",
              marginBottom: 10,
            }}
          >
            결제 내역
          </div>
          {loadingHistory ? (
            <div style={{ fontSize: 13, color: "var(--b-fg-3)", padding: "16px 0", textAlign: "center" }}>
              결제 내역을 불러오는 중…
            </div>
          ) : billingHistory.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--b-fg-3)", padding: "24px 0", textAlign: "center", borderBottom: "1px solid var(--b-line)" }}>
              결제 내역이 존재하지 않습니다.
            </div>
          ) : (
            billingHistory.map((r, i) => {
              const dateStr = new Date(r.created_at).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
              }).replace(/\. /g, ".").replace(/\.$/, "");
              
              const isRefunded = r.status === "refunded";
              
              return (
                <div
                  key={r.id || i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "12px 4px",
                    borderBottom: "1px solid var(--b-line)",
                  }}
                >
                  <span className="b-num" style={{ fontSize: 13, color: "var(--b-fg-2)" }}>
                    {dateStr}
                  </span>
                  <span
                    className="b-num"
                    style={{ 
                      fontSize: 13, 
                      marginLeft: "auto", 
                      marginRight: 18, 
                      fontWeight: 600,
                      color: isRefunded ? "rgb(224, 102, 102)" : "var(--b-fg-1)"
                    }}
                  >
                    {isRefunded 
                      ? `-${r.refunded_amount.toLocaleString()}원 (환불)`
                      : `${r.amount.toLocaleString()}원`
                    }
                  </span>
                  <span
                    className="b-chip"
                    style={{
                      background: isRefunded ? "rgba(224, 102, 102, 0.1)" : "var(--b-sig-bg)",
                      color: isRefunded ? "rgb(224, 102, 102)" : "var(--b-sig-deep)",
                      borderColor: isRefunded ? "rgba(224, 102, 102, 0.2)" : "var(--b-sig-soft)",
                      fontWeight: 600
                    }}
                  >
                    {isRefunded ? "환불 완료" : "결제 완료"}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            marginTop: 32,
            padding: "16px 20px",
            borderRadius: 12,
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid var(--b-line)",
            fontSize: 12,
            color: "var(--b-fg-3)",
            lineHeight: 1.6,
          }}
        >
          ℹ️ <strong>환불 및 자동 결제 안내</strong><br />
          결제일로부터 7일 이내이면서 서비스 사용 이력(데스크톱 앱 모니터링 가동)이 전혀 없는 경우 즉시 셀프 100% 전액 환불 신청이 가능합니다. 7일이 경과했거나 단 1회라도 모니터링을 사용한 경우에는 자동 결제 갱신 해지만 지원됩니다. 결제 오류 등으로 인한 예외 환불은 결제 정보와 함께{" "}
          <a
            href="mailto:support@barosit.com"
            style={{ color: "var(--b-sig-deep)", fontWeight: 600, textDecoration: "underline" }}
          >
            support@barosit.com
          </a>
          으로 접수해 주시면 신속히 확인하여 전원 수동 처리해 드리겠습니다.
        </div>
      </>
    );
  }

  return (
    <>
      <h2
        style={{
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: "-0.022em",
          marginBottom: 6,
        }}
      >
        플랜과 결제
      </h2>
      <p style={{ fontSize: 13, color: "var(--b-fg-3)", marginBottom: 28 }}>
        구독 상태와 결제 수단을 관리합니다.
      </p>

      <div
        style={{
          padding: 24,
          borderRadius: 14,
          marginBottom: 14,
          background: "var(--b-surface)",
          border: "1px solid var(--b-line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <span
              className="b-chip"
              style={{
                background: "var(--b-surface-2)",
                color: "var(--b-fg-2)",
                borderColor: "transparent",
                marginBottom: 12,
              }}
            >
              현재 플랜 · FREE
            </span>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.024em",
                marginBottom: 6,
                marginTop: 12,
              }}
            >
              기본 무료 플랜
            </div>
            <p style={{ fontSize: 13, color: "var(--b-fg-3)", lineHeight: 1.5, maxWidth: 500, margin: "8px 0 0 0" }}>
              현재 웹 브라우저 전용 기본 무료 체험 요금제를 이용 중입니다. 데스크톱 설치형 앱을 다운로드하고 백그라운드 무자각 관제 및 실시간 AI 코칭 피드백 혜택을 누리시려면 PRO 요금제로 업그레이드하세요!
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
          <button
            onClick={() => { window.location.hash = "#/pricing"; }}
            className="b-btn b-btn-primary"
            style={{
              background: "linear-gradient(135deg, #e08866, #c2613f)",
              color: "#fff",
              boxShadow: "0 4px 15px rgba(224, 136, 102, 0.25)",
              border: "none",
              fontWeight: 700,
              padding: "10px 20px",
            }}
          >
            PRO 플랜으로 업그레이드하기
          </button>
        </div>
      </div>

      <div
        style={{
          padding: 24,
          borderRadius: 14,
          background: "var(--b-surface)",
          border: "1px solid var(--b-line)",
          opacity: 0.6,
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>이번 달 사용 (PRO 기능)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { k: "모니터링 시간", v: "0h", s: "PRO 전용" },
            { k: "활성 일수", v: "0일", s: "PRO 전용" },
            { k: "평균 점수", v: "—", s: "PRO 전용" },
          ].map((u, i) => (
            <div key={i}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--b-fg-3)",
                  letterSpacing: "0.04em",
                  marginBottom: 6,
                }}
              >
                {u.k}
              </div>
              <div
                className="b-num"
                style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.022em" }}
              >
                {u.v}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--b-fg-3)",
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                {u.s}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ProfileLoading() {
  return (
    <div
      style={{
        background: "var(--b-bg)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        color: "var(--b-fg-3)",
      }}
    >
      불러오는 중…
    </div>
  );
}

function Profile() {
  const { user, loading, configured, signOut } = useAuth();
  const [tab, setTab] = useState<"account" | "plan">("account");
  const [subPlan, setSubPlan] = useState<"free" | "pro">("free");
  const [planId, setPlanId] = useState<"pro_monthly" | "pro_yearly" | "pro" | "free">("free");
  const [subStatus, setSubStatus] = useState<"active" | "canceled" | "none">("none");
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && configured && !user) {
      window.location.replace("#/login");
    }
  }, [loading, configured, user]);

  const fetchSub = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("user_subscriptions")
        .select("plan_id, status, current_period_end")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!error && data) {
        const isPro = data.plan_id && data.plan_id.startsWith("pro") && (
          data.status === "active" ||
          (data.status === "canceled" && data.current_period_end && new Date(data.current_period_end) > new Date())
        );
        const verifiedPlan = isPro ? "pro" : "free";
        setSubPlan(verifiedPlan);
        setPlanId((data.plan_id as any) || "free");
        setSubStatus(data.status as any);
        setPeriodEnd(data.current_period_end);
        localStorage.setItem("barosit:subscription_plan", verifiedPlan);
        return;
      } else if (!error && !data) {
        setSubPlan("free");
        setPlanId("free");
        setSubStatus("none");
        setPeriodEnd(null);
        localStorage.setItem("barosit:subscription_plan", "free");
        return;
      }
      const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
      setSubPlan(localPlan || "free");
      setPlanId(localPlan === "pro" ? "pro" : "free");
      setSubStatus(localPlan === "pro" ? "active" : "none");
      setPeriodEnd(null);
    } catch (err) {
      console.error("Failed to load user subscription:", err);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchSub();

    const handleSubChanged = () => {
      const p = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
      setSubPlan(p || "free");
      setPlanId(p === "pro" ? "pro" : "free");
      setSubStatus(p === "pro" ? "active" : "none");
      setPeriodEnd(null);
    };
    window.addEventListener("barosit:subscription-changed", handleSubChanged);
    window.addEventListener("storage", handleSubChanged);
    return () => {
      window.removeEventListener("barosit:subscription-changed", handleSubChanged);
      window.removeEventListener("storage", handleSubChanged);
    };
  }, [user]);

  if (!configured) {
    return (
      <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
        <TopNav />
        <div
          style={{
            maxWidth: 560,
            margin: "0 auto",
            padding: "80px 24px",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.018em",
              marginBottom: 8,
            }}
          >
            인증이 아직 연결되지 않았어요
          </h2>
          <p style={{ fontSize: 13, color: "var(--b-fg-3)", marginBottom: 20 }}>
            <code>.env.local</code> 의 <code>VITE_SUPABASE_URL</code> /{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> 를 채우고 다시 시작하세요. 자세한 셋업은{" "}
            <code>docs/auth-google-setup.md</code> 참고.
          </p>
          <a
            href="#/landing"
            className="b-btn b-btn-ghost"
            style={{ textDecoration: "none" }}
          >
            랜딩으로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  if (loading || !user) return <ProfileLoading />;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    "";
  const avatarUrl = (meta.avatar_url as string | undefined) ?? null;
  const sidebarInitial = (fullName || user.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    window.location.replace("#/landing");
  };

  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav />
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "40px 56px",
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: 32,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 28,
              padding: "8px 4px",
            }}
          >
            <Avatar size={44} initial={sidebarInitial} imageUrl={avatarUrl} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {fullName || user.email || "사용자"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--b-fg-3)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user.email}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(
              [
                { k: "account", i: "settings", t: "계정" },
                { k: "plan", i: "sparkle", t: "플랜과 결제" },
              ] as Array<{ k: "account" | "plan"; i: IconName; t: string }>
            ).map((it) => (
              <button
                key={it.k}
                onClick={() => setTab(it.k)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  color: tab === it.k ? "var(--b-fg-1)" : "var(--b-fg-3)",
                  background: tab === it.k ? "var(--b-surface)" : "transparent",
                  border:
                    tab === it.k
                      ? "1px solid var(--b-line)"
                      : "1px solid transparent",
                }}
              >
                <Icon name={it.i} size={14} />
                {it.t}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 24, padding: "0 4px" }}>
            <button
              type="button"
              onClick={handleSignOut}
              className="b-btn b-btn-quiet"
              style={{
                width: "100%",
                justifyContent: "flex-start",
                color: "var(--b-warn)",
              }}
            >
              <Icon name="arrow-r" size={13} /> 로그아웃
            </button>
          </div>
        </div>

        <div>
          {tab === "account" && <AccountTab user={user} subPlan={subPlan} />}
          {tab === "plan" && (
            <PlanTab 
              subPlan={subPlan} 
              planId={planId}
              subStatus={subStatus} 
              periodEnd={periodEnd} 
              onUpdateSubscription={fetchSub} 
            />
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ───────── Router ─────────

export type MarketingRoute =
  | "landing"
  | "login"
  | "signup"
  | "download-mac"
  | "download-win"
  | "pricing"
  | "profile"
  | "privacy"
  | "terms"
  | "community"
  | "changelog"
  | "auth-callback";

export function routeFromHash(hash: string): MarketingRoute | null {
  const h = hash.replace(/^#\/?/, "").split("?")[0];
  if (h === "landing") return "landing";
  if (h === "login") return "login";
  if (h === "signup") return "signup";
  if (h === "download/mac") return "download-mac";
  if (h === "download/win") return "download-win";
  if (h === "pricing") return "pricing";
  if (h === "profile" || h === "account") return "profile";
  if (h === "privacy") return "privacy";
  if (h === "terms") return "terms";
  if (h === "changelog" || h === "release" || h === "releases") return "changelog";
  if (h === "community" || h === "contact" || h === "support") return "community";
  if (h === "auth/callback") return "auth-callback";
  return null;
}

function routeBody(route: MarketingRoute) {
  switch (route) {
    case "landing":
      return <Landing />;
    case "login":
      return <Login mode="signin" />;
    case "signup":
      return <Login mode="signup" />;
    case "download-mac":
      return <Download os="mac" />;
    case "download-win":
      return <Download os="win" />;
    case "pricing":
      return <Pricing />;
    case "profile":
      return <Profile />;
    case "privacy":
      return <LegalPage kind="privacy" />;
    case "terms":
      return <LegalPage kind="terms" />;
    case "changelog":
      return <ChangelogPage />;
    case "community":
      return <Contact />;
    case "auth-callback":
      return <AuthCallback />;
  }
}

export function handleContactClick() {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard
      .writeText("support@barosit.com")
      .then(() => {
        if (typeof window !== "undefined" && (window as any).showContactToast) {
          (window as any).showContactToast();
        }
      })
      .catch(() => {
        // clipboard fallback if needed
      });
  }
}

export function Marketing({ route }: { route: MarketingRoute }) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    (window as any).showContactToast = () => {
      setToastMessage("이메일 주소(support@barosit.com)가 복사되었습니다.");
      clearTimeout(timer);
      timer = setTimeout(() => {
        setToastMessage(null);
      }, 3000);
    };
    return () => {
      clearTimeout(timer);
    };
  }, []);

  // 마케팅 페이지는 라이트 기본 — 디자인 결정 (앱은 다크 지원, 웹은 라이트 고정)
  return (
    <div
      className="b-force-light"
      style={{ minHeight: "100vh", background: "var(--b-bg)", color: "var(--b-fg-1)" }}
    >
      {routeBody(route)}

      {toastMessage && (
        <>
          <style>{`
            @keyframes fadeInUp {
              from {
                opacity: 0;
                transform: translate(-50%, 20px);
              }
              to {
                opacity: 1;
                transform: translate(-50%, 0);
              }
            }
          `}</style>
          <div
            style={{
              position: "fixed",
              bottom: 32,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(17, 24, 39, 0.9)",
              backdropFilter: "blur(8px)",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: "999px",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
              fontSize: 14,
              fontWeight: 500,
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              gap: 8,
              animation: "fadeInUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
              border: "1px solid rgba(255, 255, 255, 0.15)",
            }}
          >
            <Icon name="check" size={15} style={{ color: "var(--b-sig)" }} />
            {toastMessage}
          </div>
        </>
      )}
    </div>
  );
}
