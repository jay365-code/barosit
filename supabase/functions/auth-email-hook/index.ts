// POST /functions/v1/auth-email-hook — Supabase "Send Email" Auth Hook.
//
// 왜 필요한가: 대시보드의 Auth 메일 템플릿은 프로젝트당 1벌이고 발송 시점에
// 사용자 언어를 알 변수가 없다(쓸 수 있는 건 ConfirmationURL·Token·SiteURL 등).
// 그래서 가입 확인·비밀번호 재설정 메일이 전 사용자에게 영문 기본 템플릿으로
// 나가고 있었다. 이 훅이 발송을 가로채 수신자 언어로 렌더해 Resend 로 보낸다.
//
// 언어 판단 순서:
//   1) user_metadata.lang — 가입 시 클라이언트가 심는다(프로필 행이 아직 없는
//      가입 확인 메일이 이 경로를 탄다)
//   2) profiles.preferred_lang — 이미 가입한 사용자
//   3) ko 폴백
//
// 인증: Supabase 가 standard-webhooks 서명을 붙여 호출한다. verify_jwt 는 꺼야
// 하고(게이트웨이가 JWT 를 요구하면 훅 호출이 401), 대신 서명을 검증한다.
// 시크릿은 대시보드에서 발급한 값을 AUTH_EMAIL_HOOK_SECRET 에 넣는다
// (형식: v1,whsec_<base64>).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient } from "../_shared/admin.ts";
import { sendUserEmail, userMailLang, normalizeMailLang, type MailLang } from "../_shared/email.ts";
import { renderAuthEmail, type AuthEmailKind } from "../_shared/authEmail.ts";

const HOOK_SECRET = Deno.env.get("AUTH_EMAIL_HOOK_SECRET") ?? "";

function bad(message: string, status = 400): Response {
  // 훅이 에러를 반환하면 Supabase 는 인증 요청 자체를 실패시킨다.
  // 메시지는 사용자에게 노출될 수 있으므로 내부 정보를 담지 않는다.
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// standard-webhooks: HMAC-SHA256("<id>.<timestamp>.<body>") 를 base64 로 비교.
async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  if (!HOOK_SECRET) {
    console.error("[auth-email-hook] AUTH_EMAIL_HOOK_SECRET 미설정 — 요청 거부");
    return false;
  }
  const id = req.headers.get("webhook-id");
  const timestamp = req.headers.get("webhook-timestamp");
  const signatureHeader = req.headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  // 재전송 공격 방어 — 5분 이상 지난 요청은 거부.
  const skewSec = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(skewSec) || skewSec > 300) return false;

  const secretB64 = HOOK_SECRET.replace(/^v1,\s*/, "").replace(/^whsec_/, "");
  const keyBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  // 헤더엔 "v1,<sig> v1,<sig2>" 처럼 여러 개가 올 수 있다(시크릿 로테이션).
  return signatureHeader
    .split(" ")
    .map((part) => part.split(",")[1] ?? "")
    .some((sig) => sig.length === expected.length && timingSafeEqual(sig, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const KIND_BY_ACTION: Record<string, AuthEmailKind> = {
  signup: "signup",
  recovery: "recovery",
  invite: "invite",
  magiclink: "magiclink",
  email_change: "email_change",
  email_change_current: "email_change",
  email_change_new: "email_change",
  reauthentication: "reauthentication",
};

serve(async (req) => {
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const rawBody = await req.text();
  if (!(await verifySignature(req, rawBody))) return bad("Invalid signature", 401);

  try {
    const payload = JSON.parse(rawBody);
    const user = payload?.user ?? {};
    const d = payload?.email_data ?? {};
    const action = String(d.email_action_type ?? "");
    const kind = KIND_BY_ACTION[action];
    if (!kind) {
      console.error("[auth-email-hook] 알 수 없는 email_action_type:", action);
      return bad("Unsupported email action", 400);
    }

    // 가입 확인 메일은 profiles 행이 아직 없으므로 메타데이터를 먼저 본다.
    const metaLang = user?.user_metadata?.lang;
    const lang: MailLang = metaLang
      ? normalizeMailLang(metaLang)
      : await userMailLang(adminClient(), user?.id);

    // 이메일 변경은 새 주소용 토큰이 따로 온다.
    const tokenHash = action === "email_change_new" && d.token_hash_new ? d.token_hash_new : d.token_hash;
    const token = action === "email_change_new" && d.token_new ? d.token_new : d.token;

    const verifyUrl =
      `${d.site_url}/auth/v1/verify?token=${encodeURIComponent(tokenHash ?? "")}` +
      `&type=${encodeURIComponent(action)}` +
      (d.redirect_to ? `&redirect_to=${encodeURIComponent(d.redirect_to)}` : "");

    const { subject, html } = renderAuthEmail(kind, lang, { url: verifyUrl, token });

    const ok = await sendUserEmail(user?.email, subject, html);
    if (!ok) return bad("Failed to send email", 500);

    console.log(`[auth-email-hook] sent action=${action} lang=${lang}`);
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[auth-email-hook] error:", e?.message ?? e);
    return bad("Internal error", 500);
  }
});
