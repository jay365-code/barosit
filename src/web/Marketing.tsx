import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import privacyMd from "../../docs/privacy.md?raw";
import termsMd from "../../docs/terms.md?raw";
import { supabase } from "../auth/supabase";
import { useAuth } from "../auth/useAuth";
import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";
import {
  MAIN_SLOGAN_LINE1,
  MAIN_SLOGAN_LINE2,
  pickSubSlogan,
} from "../slogans";

const CONTACT_EMAIL = "jhlee@gubed.co.kr";
const GITHUB_URL = "https://github.com/jay365-code/barosit";

// ───────── Shared ─────────

function TopNav({ active }: { active?: string }) {
  const { user } = useAuth();
  const items = [
    { label: "기능", hash: "#/landing" },
    { label: "가격", hash: "#/pricing" },
    { label: "다운로드", hash: "#/download/mac" },
    { label: "문의", hash: "#/contact" },
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
        padding: "40px 56px",
        borderTop: "1px solid var(--b-line)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        maxWidth: 1180,
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Logo size={24} stroke="var(--b-sig)" />
        <span style={{ fontSize: 13, color: "var(--b-fg-3)" }}>© 2026 Barosit</span>
      </div>
      <div style={{ display: "flex", gap: 18, fontSize: 12, color: "var(--b-fg-3)" }}>
        <a href="#/privacy" style={{ color: "inherit", textDecoration: "none" }}>
          개인정보 처리방침
        </a>
        <a href="#/terms" style={{ color: "inherit", textDecoration: "none" }}>
          이용약관
        </a>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          style={{ color: "inherit", textDecoration: "none" }}
        >
          오픈소스
        </a>
        <a href="#/contact" style={{ color: "inherit", textDecoration: "none" }}>
          문의
        </a>
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
          웹캠으로 자세를 살펴드릴게요. 거북목·어깨 기울임·등 구부정·턱 괴임·모니터
          거리·어깨 비대칭 6종을 살펴보다 잘못된 자세가 일정 시간 이어지면 부드럽게
          알려드립니다.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <a
            href="#/app"
            className="b-btn b-btn-primary"
            style={{ height: 48, padding: "0 22px", fontSize: 14, textDecoration: "none" }}
          >
            <Icon name="arrow-r" size={14} /> 웹에서 바로 체험
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
                d: "거북목 · 턱 괴임 · 어깨 기울임 · 등 구부정. 네 가지를 따로 구분해 알려드려요.",
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
              { k: "동작 분석", v: "13가지" },
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
                t: "자세 4종 감지",
                d: "거북목 · 턱 괴임 · 어깨 기울임 · 등 구부정을 구분해 짚어드려요",
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
        window.location.replace("#/landing");
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
  const md = useMemo(() => LEGAL_SOURCE[kind], [kind]);
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
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
            href="#/contact"
            className="b-btn b-btn-quiet"
            style={{ textDecoration: "none" }}
          >
            문의하기
          </a>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ───────── Contact ─────────

function Contact() {
  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav active="문의" />
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "70px 56px 80px",
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
          CONTACT
        </div>
        <h1
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "-0.028em",
            margin: 0,
            marginBottom: 14,
            lineHeight: 1.15,
          }}
        >
          편하게 연락 주세요
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "var(--b-fg-2)",
            lineHeight: 1.6,
            marginBottom: 36,
            maxWidth: 520,
          }}
        >
          버그 제보, 기능 제안, 약관/처리방침 관련 문의 모두 같은 메일로 받습니다.
          영업일 기준 7일 이내 답장 드려요.
        </p>

        <div
          style={{
            padding: 28,
            borderRadius: 14,
            background: "var(--b-surface)",
            border: "1px solid var(--b-line)",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--b-fg-3)",
              letterSpacing: "0.08em",
              marginBottom: 8,
            }}
          >
            이메일
          </div>
          <div
            className="b-num"
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.014em",
              marginBottom: 18,
            }}
          >
            {CONTACT_EMAIL}
          </div>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
              "[BaroSit] 문의",
            )}`}
            className="b-btn b-btn-primary"
            style={{
              height: 46,
              padding: "0 22px",
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            <Icon name="arrow-r" size={13} /> 메일 보내기
          </a>
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
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            GitHub Issues
          </div>
          <p style={{ fontSize: 13, color: "var(--b-fg-3)", margin: 0, marginBottom: 14 }}>
            재현 가능한 버그·기능 제안은 공개 이슈가 가장 빠릅니다. 소스 코드도 같은
            저장소에서 공개되어 있어요.
          </p>
          <a
            href={`${GITHUB_URL}/issues`}
            target="_blank"
            rel="noreferrer"
            className="b-btn b-btn-ghost"
            style={{ textDecoration: "none" }}
          >
            GitHub 에서 이슈 열기 <Icon name="arrow-r" size={12} />
          </a>
        </div>

        <div
          style={{
            padding: 24,
            borderRadius: 14,
            background: "var(--b-surface-2)",
            border: "1px solid var(--b-line)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--b-fg-3)",
              letterSpacing: "0.08em",
              marginBottom: 10,
            }}
          >
            운영자 정보
          </div>
          <div style={{ fontSize: 13, color: "var(--b-fg-2)", lineHeight: 1.8 }}>
            <div>
              서비스명 · <strong>BaroSit (바로씻)</strong>
            </div>
            <div>운영자 · (사업자 등록 후 기재)</div>
            <div>
              소스코드 ·{" "}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--b-sig-deep)", textDecoration: "underline" }}
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
  const { signInWithGoogle, signInWithMagicLink, configured, user, loading } =
    useAuth();
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicSentTo, setMagicSentTo] = useState<string | null>(null);
  const [magicError, setMagicError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      window.location.replace("#/landing");
    }
  }, [loading, user]);

  const handleGoogle = async () => {
    setOauthError(null);
    if (!configured) {
      setOauthError("아직 인증이 연결되지 않았습니다. .env.local 의 Supabase 설정을 확인하세요.");
      return;
    }
    setOauthBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setOauthBusy(false);
      setOauthError(e instanceof Error ? e.message : "Google 로그인에 실패했어요.");
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setMagicError(null);
    if (!configured) {
      setMagicError("아직 인증이 연결되지 않았습니다. .env.local 의 Supabase 설정을 확인하세요.");
      return;
    }
    setMagicBusy(true);
    try {
      await signInWithMagicLink(email);
      setMagicSentTo(email.trim().toLowerCase());
    } catch (err) {
      setMagicError(
        err instanceof Error ? err.message : "메일을 보내지 못했어요.",
      );
    } finally {
      setMagicBusy(false);
    }
  };

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
            {mode === "signin" ? "계속하려면 로그인해주세요" : "몇 초면 가입할 수 있어요"}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={oauthBusy}
              className="b-btn b-btn-ghost"
              style={{
                height: 42,
                justifyContent: "center",
                fontSize: 13,
                gap: 8,
                opacity: oauthBusy ? 0.6 : 1,
                cursor: oauthBusy ? "wait" : "pointer",
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
              {oauthBusy ? "Google 로 이동 중…" : "Google로 계속하기"}
            </button>
            <button
              type="button"
              disabled
              title="카카오 로그인 준비 중"
              className="b-btn b-btn-ghost"
              style={{
                height: 42,
                justifyContent: "center",
                fontSize: 13,
                gap: 8,
                background: "#FEE500",
                borderColor: "#FEE500",
                color: "#191919",
                opacity: 0.55,
                cursor: "not-allowed",
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
              카카오로 계속하기 (준비 중)
            </button>
          </div>
          {oauthError && (
            <div
              role="alert"
              style={{
                marginTop: -8,
                marginBottom: 14,
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--b-warn-bg, #fff4f0)",
                border: "1px solid var(--b-warn, #c4543a)",
                color: "var(--b-warn, #c4543a)",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {oauthError}
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              margin: "20px 0",
              fontSize: 11,
              color: "var(--b-fg-4)",
            }}
          >
            <div style={{ flex: 1, height: 1, background: "var(--b-line)" }} />
            또는 이메일로 로그인 링크 받기
            <div style={{ flex: 1, height: 1, background: "var(--b-line)" }} />
          </div>

          {magicSentTo ? (
            <div
              style={{
                padding: 20,
                borderRadius: 12,
                background: "var(--b-sig-bg)",
                border: "1px solid var(--b-sig-soft)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  marginBottom: 6,
                  color: "var(--b-sig-deep)",
                }}
              >
                📩 메일을 보내드렸어요
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--b-fg-2)",
                  lineHeight: 1.55,
                  margin: 0,
                  marginBottom: 12,
                }}
              >
                <strong>{magicSentTo}</strong>
                <br />
                받은편지함에서 BaroSit 메일을 열고 로그인 링크를 클릭하세요. 같은
                브라우저에서 열어야 합니다 (스팸함도 한 번 확인해주세요).
              </p>
              <button
                type="button"
                className="b-btn b-btn-quiet"
                style={{ height: 34, fontSize: 12 }}
                onClick={() => {
                  setMagicSentTo(null);
                  setMagicError(null);
                }}
              >
                다른 이메일로 다시 보내기
              </button>
            </div>
          ) : (
            <form onSubmit={handleMagicLink}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  htmlFor="magic-email"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--b-fg-2)",
                  }}
                >
                  이메일
                </label>
                <input
                  id="magic-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  disabled={magicBusy}
                  style={{
                    width: "100%",
                    height: 42,
                    padding: "0 12px",
                    border: "1px solid var(--b-line-2)",
                    borderRadius: 8,
                    background: "var(--b-surface)",
                    color: "var(--b-fg-1)",
                    fontFamily: "inherit",
                    fontSize: 13,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={magicBusy || !email.trim()}
                className="b-btn b-btn-primary"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  height: 44,
                  fontSize: 14,
                  marginTop: 14,
                  opacity: magicBusy ? 0.6 : 1,
                  cursor: magicBusy ? "wait" : "pointer",
                }}
              >
                {magicBusy ? "메일 보내는 중…" : "이메일로 로그인 링크 받기"}
              </button>

              {magicError && (
                <div
                  role="alert"
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--b-warn-bg, #fff4f0)",
                    border: "1px solid var(--b-warn, #c4543a)",
                    color: "var(--b-warn, #c4543a)",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  {magicError}
                </div>
              )}
            </form>
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
            비밀번호 없이 이메일로 받은 링크를 클릭하면 로그인됩니다.
            <br />
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
            <li>자세 4종 감지 (거북목 · 턱 괴임 · 어깨 기울임 · 등 구부정)</li>
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

function Pricing() {
  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav active="가격" />
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "70px 56px" }}>
        <div style={{ textAlign: "center", marginBottom: 50 }}>
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
          <p style={{ fontSize: 16, color: "var(--b-fg-2)" }}>
            자세 감지의 핵심은 평생 무료입니다. Pro는 다기기 동기화와 리포트만
            추가해요.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            {
              name: "Free",
              price: "0원",
              sub: "평생 무료",
              feats: [
                "자세 4종 감지",
                "0–100 점수",
                "위젯 모드",
                "오늘의 통계",
                "실루엣/영상 모드",
                "온디바이스 100%",
              ],
              cta: "무료로 시작",
              primary: false,
            },
            {
              name: "Pro",
              price: "월 5,900원",
              sub: "연간 결제 시 월 4,900원",
              feats: [
                "Free의 모든 기능",
                "다기기 점수 동기화",
                "주간/월간 리포트 이메일",
                "AI 코칭 메시지 (한 줄)",
                "90일 → 무제한 기록",
                "우선 지원",
              ],
              cta: "Pro 시작하기",
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
              <button
                className={`b-btn ${p.primary ? "b-btn-primary" : "b-btn-ghost"}`}
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
}: {
  user: import("@supabase/supabase-js").User | null;
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
                background: "var(--b-surface-2)",
                color: "var(--b-fg-2)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              FREE
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

function PlanTab() {
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
          background: "linear-gradient(135deg, var(--b-sig-bg) 0%, var(--b-bg) 100%)",
          border: "1px solid var(--b-sig-soft)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
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
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.024em",
                marginBottom: 4,
                marginTop: 12,
              }}
            >
              월 5,900원
            </div>
            <div style={{ fontSize: 13, color: "var(--b-fg-3)" }}>
              다음 결제일 · 2026년 6월 11일
            </div>
          </div>
          <button className="b-btn b-btn-ghost">결제수단 변경</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button className="b-btn b-btn-ghost" style={{ color: "var(--b-fg-3)" }}>
            연간으로 변경 (2개월 무료)
          </button>
          <button className="b-btn b-btn-quiet" style={{ color: "var(--b-warn)" }}>
            플랜 취소
          </button>
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
        {[
          { d: "2026.05.11", a: "5,900원", s: "결제 완료" },
          { d: "2026.04.11", a: "5,900원", s: "결제 완료" },
          { d: "2026.03.11", a: "5,900원", s: "결제 완료" },
        ].map((r, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 4px",
              borderBottom: "1px solid var(--b-line)",
            }}
          >
            <span className="b-num" style={{ fontSize: 13, color: "var(--b-fg-2)" }}>
              {r.d}
            </span>
            <span
              className="b-num"
              style={{ fontSize: 13, marginLeft: "auto", marginRight: 18, fontWeight: 600 }}
            >
              {r.a}
            </span>
            <span
              className="b-chip"
              style={{
                background: "var(--b-sig-bg)",
                color: "var(--b-sig-deep)",
                borderColor: "var(--b-sig-soft)",
              }}
            >
              {r.s}
            </span>
          </div>
        ))}
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

  useEffect(() => {
    if (!loading && configured && !user) {
      window.location.replace("#/login");
    }
  }, [loading, configured, user]);

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
          {tab === "account" && <AccountTab user={user} />}
          {tab === "plan" && <PlanTab />}
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
  | "contact"
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
  if (h === "contact" || h === "support") return "contact";
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
    case "contact":
      return <Contact />;
    case "auth-callback":
      return <AuthCallback />;
  }
}

export function Marketing({ route }: { route: MarketingRoute }) {
  // 마케팅 페이지는 라이트 기본 — 디자인 결정 (앱은 다크 지원, 웹은 라이트 고정)
  return (
    <div
      className="b-force-light"
      style={{ minHeight: "100vh", background: "var(--b-bg)", color: "var(--b-fg-1)" }}
    >
      {routeBody(route)}
    </div>
  );
}
