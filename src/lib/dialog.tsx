// 웹·데스크톱 공통 confirm/alert 모달.
//
// 왜 window.confirm/alert 를 쓰지 않나: Tauri(wry/WKWebView)는 JS 다이얼로그 패널
// 델리게이트를 구현하지 않아, 데스크톱 앱에서 window.confirm() 은 즉시 false 를
// 반환하고 window.alert() 은 아무것도 하지 않는다. 그 결과 `if (!window.confirm())
// return;` 가드가 항상 조기 리턴돼 구독 취소·카드 삭제·주기 전환 등이 "눌러도
// 반응 없음" 상태가 됐다. DOM 기반 자체 모달은 웹·웹뷰 양쪽에서 동일하게 동작한다.
//
// 사용: `if (!(await confirmDialog(msg))) return;` / `await alertDialog(msg)`.
// 앱 루트(main.tsx)에 <DialogHost/> 를 한 번 마운트하면 어디서든 호출할 수 있다.
import { useCallback, useEffect, useState } from "react";
import i18n from "../i18n";

export interface DialogOptions {
  title?: string;
  okText?: string;
  cancelText?: string;
  danger?: boolean; // 확인 버튼을 경고색으로 (파괴적 액션)
}

type DialogKind = "confirm" | "alert";
interface DialogRequest extends DialogOptions {
  kind: DialogKind;
  message: string;
  resolve: (ok: boolean) => void;
}

// 모듈 스코프 브리지 — DialogHost 마운트 시 enqueue 를 등록한다. 마운트 전에 호출된
// 요청은 buffer 에 담아 두었다가 호스트가 뜨면 흘려보낸다(첫 렌더 경합 방어).
let enqueue: ((req: DialogRequest) => void) | null = null;
const buffer: DialogRequest[] = [];

function open(kind: DialogKind, message: string, opts: DialogOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const req: DialogRequest = { kind, message, resolve, ...opts };
    if (enqueue) enqueue(req);
    else buffer.push(req);
  });
}

/** 확인/취소 모달. 확인 시 true, 취소·닫기 시 false 로 resolve. */
export function confirmDialog(message: string, opts?: DialogOptions): Promise<boolean> {
  return open("confirm", message, opts);
}

/** 안내 모달(확인 버튼 하나). 닫히면 resolve. */
export function alertDialog(message: string, opts?: DialogOptions): Promise<void> {
  return open("alert", message, opts).then(() => undefined);
}

export function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    enqueue = (req) => setQueue((q) => [...q, req]);
    if (buffer.length) setQueue((q) => [...q, ...buffer.splice(0)]);
    return () => {
      enqueue = null;
    };
  }, []);

  const settle = useCallback((ok: boolean) => {
    setQueue((q) => {
      const [head, ...rest] = q;
      head?.resolve(ok);
      return rest;
    });
  }, []);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        settle(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, settle]);

  if (!current) return null;

  const isConfirm = current.kind === "confirm";
  const okText = current.okText ?? i18n.t("common:confirm");
  const cancelText = current.cancelText ?? i18n.t("common:cancel");

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => settle(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10, 10, 10, 0.6)",
        backdropFilter: "blur(6px)",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--b-surface)",
          color: "var(--b-fg-1)",
          border: "1px solid var(--b-line)",
          borderRadius: 16,
          boxShadow: "var(--b-shadow-modal)",
          padding: "22px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {current.title && (
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{current.title}</h3>
        )}
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--b-fg-2)",
            whiteSpace: "pre-wrap",
          }}
        >
          {current.message}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
          {isConfirm && (
            <button
              type="button"
              className="b-btn b-btn-ghost"
              onClick={() => settle(false)}
              style={{
                fontSize: 13,
                padding: "8px 16px",
                border: "1px solid var(--b-line-2)",
                color: "var(--b-fg-2)",
              }}
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            className="b-btn b-btn-primary"
            autoFocus
            onClick={() => settle(true)}
            style={{
              fontSize: 13,
              padding: "8px 16px",
              fontWeight: 700,
              border: "none",
              color: "#fff",
              background: current.danger
                ? "linear-gradient(135deg, #e0665a, #c2453f)"
                : "linear-gradient(135deg, #7eb09c, #5b8c7a)",
            }}
          >
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
}
