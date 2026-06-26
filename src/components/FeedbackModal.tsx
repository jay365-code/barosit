import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  submitFeedback,
  feedbackMailtoFallback,
  type FeedbackCategory,
} from "../lib/feedback";
import { platform } from "../platform";
import { supabase } from "../auth/supabase";

const CATEGORIES: FeedbackCategory[] = ["bug", "idea", "other"];
const MAX_LEN = 2000;

export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("settings");
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "ok" | "err">("idle");

  // 로그인 상태면 회신용 이메일 입력칸을 숨긴다 (계정 이메일 사용)
  const [hasAccount, setHasAccount] = useState<boolean>(false);
  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) setHasAccount(!!data.session?.user);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const trimmed = message.trim();
  const canSend = trimmed.length > 0 && state !== "sending";

  const handleSend = async () => {
    if (!canSend) return;
    setState("sending");
    try {
      await submitFeedback({ category, message: trimmed, email: email || undefined });
      setState("ok");
      setTimeout(onClose, 1400);
    } catch {
      setState("err");
    }
  };

  const handleMailFallback = () => {
    platform
      .openBrowser(feedbackMailtoFallback({ category, message: trimmed }))
      .catch(() => undefined);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, 100%)",
          background: "var(--b-surface)",
          border: "1px solid var(--b-line-2)",
          borderRadius: 16,
          padding: 24,
          color: "var(--b-fg-1)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{t("feedback.title")}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            style={{ background: "none", border: "none", color: "var(--b-fg-3)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--b-fg-3)", lineHeight: 1.5 }}>
          {t("feedback.desc")}
        </p>

        {state === "ok" ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "var(--b-sig, #4ade80)", fontSize: 14, fontWeight: 600 }}>
            {t("feedback.sent")}
          </div>
        ) : (
          <>
            {/* 카테고리 선택 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 9,
                    cursor: "pointer",
                    border: `1px solid ${category === c ? "var(--b-sig, #4ade80)" : "var(--b-line, rgba(255,255,255,0.12))"}`,
                    background: category === c ? "var(--b-sig-soft, rgba(74,222,128,0.12))" : "transparent",
                    color: category === c ? "var(--b-sig, #4ade80)" : "var(--b-fg-2)",
                  }}
                >
                  {t(`feedback.category.${c}`)}
                </button>
              ))}
            </div>

            <textarea
              value={message}
              maxLength={MAX_LEN}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("feedback.placeholder")}
              rows={5}
              style={{
                width: "100%",
                resize: "vertical",
                padding: "10px 12px",
                fontSize: 13,
                lineHeight: 1.5,
                borderRadius: 10,
                border: "1px solid var(--b-line, rgba(255,255,255,0.12))",
                background: "var(--b-surface-2)",
                color: "var(--b-fg-1)",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />

            {!hasAccount && (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("feedback.emailPlaceholder")}
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: "9px 12px",
                  fontSize: 13,
                  borderRadius: 10,
                  border: "1px solid var(--b-line-2)",
                  background: "var(--b-surface-2)",
                  color: "var(--b-fg-1)",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            )}

            {state === "err" && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#f87171", lineHeight: 1.5 }}>
                {t("feedback.error")}{" "}
                <button
                  type="button"
                  onClick={handleMailFallback}
                  style={{ background: "none", border: "none", color: "var(--b-sig, #4ade80)", textDecoration: "underline", cursor: "pointer", fontSize: 12, padding: 0, fontFamily: "inherit" }}
                >
                  {t("feedback.mailFallback")}
                </button>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button type="button" className="b-btn b-btn-ghost" onClick={onClose} style={{ fontSize: 13 }}>
                {t("feedback.cancel")}
              </button>
              <button
                type="button"
                className="b-btn b-btn-primary"
                onClick={handleSend}
                disabled={!canSend}
                style={{ fontSize: 13 }}
              >
                {state === "sending" ? t("feedback.sending") : t("feedback.send")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
