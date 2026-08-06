// Supabase Auth 메일(가입 확인·비밀번호 재설정 등)을 우리가 직접 보낼 때 쓰는
// 템플릿. 대시보드 템플릿은 프로젝트당 1벌이라 언어 분기가 불가능해서,
// Send Email Hook 으로 받아 여기서 수신자 언어로 렌더한다.
//
// 레이아웃·톤은 거래 메일(_shared/email.ts)과 맞춘다.
import type { MailLang } from "./email.ts";

const FOOTER: Record<MailLang, string> = {
  ko: "본 메일은 발신전용입니다. 문의는 support@barosit.com 으로 보내주세요.",
  en: "This is a send-only address. For questions, please email support@barosit.com.",
  ja: "本メールは送信専用です。お問い合わせは support@barosit.com までお願いいたします。",
};

const IGNORE_NOTE: Record<MailLang, string> = {
  ko: "본인이 요청한 것이 아니라면 이 메일은 무시하셔도 됩니다.",
  en: "If you didn't request this, you can safely ignore this email.",
  ja: "お心当たりがない場合は、このメールを無視していただいて問題ありません。",
};

function layout(lang: MailLang, title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  const ctaHtml = cta
    ? `<div style="text-align:center;margin:28px 0 8px"><a href="${cta.url}" style="display:inline-block;background:#5b8c7a;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px">${cta.label}</a></div>`
    : "";
  return `
  <div lang="${lang}" style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:30px 25px;border:1px solid #e2e8f0;border-radius:14px">
    <div style="text-align:center;padding-bottom:22px;border-bottom:1px solid #f1f5f9;margin-bottom:22px">
      <span style="font-size:22px;font-weight:900;color:#0f172a;letter-spacing:-0.04em">barosit</span>
    </div>
    <h2 style="color:#0f172a;font-weight:700;margin-top:0;font-size:18px;line-height:1.4">${title}</h2>
    <div style="line-height:1.65;color:#334155;font-size:14px">${bodyHtml}</div>
    ${ctaHtml}
    <div style="font-size:12px;color:#64748b;margin-top:22px">${IGNORE_NOTE[lang]}</div>
    <div style="font-size:11px;color:#94a3b8;margin-top:28px;text-align:center;border-top:1px solid #f1f5f9;padding-top:18px">
      ${FOOTER[lang]}
    </div>
  </div>`;
}

// 링크가 열리지 않을 때를 위한 원문 URL 안내 (메일 클라이언트가 버튼을 막는 경우).
function rawLink(lang: MailLang, url: string): string {
  const label: Record<MailLang, string> = {
    ko: "버튼이 열리지 않으면 아래 주소를 브라우저에 붙여넣어 주세요.",
    en: "If the button doesn't work, paste this address into your browser.",
    ja: "ボタンが開かない場合は、以下のアドレスをブラウザに貼り付けてください。",
  };
  return `<p style="margin-top:18px;font-size:12px;color:#64748b">${label[lang]}<br>
    <span style="word-break:break-all;color:#475569">${url}</span></p>`;
}

export type AuthEmailKind =
  | "signup"
  | "recovery"
  | "invite"
  | "magiclink"
  | "email_change"
  | "reauthentication";

// 6자리 코드만 보내는 재인증은 URL 이 없다.
export function renderAuthEmail(
  kind: AuthEmailKind,
  lang: MailLang,
  opts: { url?: string; token?: string },
): { subject: string; html: string } {
  const url = opts.url ?? "";

  switch (kind) {
    case "signup": {
      const t: Record<MailLang, { subject: string; title: string; body: string; cta: string }> = {
        ko: {
          subject: "[BaroSit] 이메일 주소를 확인해 주세요",
          title: "가입을 마무리해 주세요",
          body: `<p>BaroSit 에 가입해 주셔서 감사합니다. 아래 버튼을 눌러 이메일 주소를 확인하면 가입이 완료됩니다.</p>`,
          cta: "이메일 주소 확인하기",
        },
        en: {
          subject: "[BaroSit] Please confirm your email address",
          title: "Finish setting up your account",
          body: `<p>Thanks for signing up for BaroSit. Confirm your email address with the button below to finish creating your account.</p>`,
          cta: "Confirm email address",
        },
        ja: {
          subject: "[BaroSit] メールアドレスをご確認ください",
          title: "登録を完了してください",
          body: `<p>BaroSit にご登録いただきありがとうございます。下のボタンからメールアドレスを確認すると登録が完了します。</p>`,
          cta: "メールアドレスを確認する",
        },
      };
      const x = t[lang];
      return { subject: x.subject, html: layout(lang, x.title, x.body + rawLink(lang, url), { label: x.cta, url }) };
    }

    case "recovery": {
      const t: Record<MailLang, { subject: string; title: string; body: string; cta: string }> = {
        ko: {
          subject: "[BaroSit] 비밀번호 재설정 안내",
          title: "비밀번호를 재설정해 주세요",
          body: `<p>비밀번호 재설정 요청을 받았습니다. 아래 버튼을 눌러 새 비밀번호를 설정해 주세요.</p>`,
          cta: "새 비밀번호 설정하기",
        },
        en: {
          subject: "[BaroSit] Reset your password",
          title: "Reset your password",
          body: `<p>We received a request to reset your password. Use the button below to choose a new one.</p>`,
          cta: "Set a new password",
        },
        ja: {
          subject: "[BaroSit] パスワード再設定のご案内",
          title: "パスワードを再設定してください",
          body: `<p>パスワード再設定のリクエストを受け付けました。下のボタンから新しいパスワードを設定してください。</p>`,
          cta: "新しいパスワードを設定する",
        },
      };
      const x = t[lang];
      return { subject: x.subject, html: layout(lang, x.title, x.body + rawLink(lang, url), { label: x.cta, url }) };
    }

    case "email_change": {
      const t: Record<MailLang, { subject: string; title: string; body: string; cta: string }> = {
        ko: {
          subject: "[BaroSit] 새 이메일 주소를 확인해 주세요",
          title: "이메일 주소 변경 확인",
          body: `<p>계정의 이메일 주소 변경 요청을 받았습니다. 아래 버튼을 눌러 새 주소를 확인해 주세요.</p>`,
          cta: "새 주소 확인하기",
        },
        en: {
          subject: "[BaroSit] Please confirm your new email address",
          title: "Confirm your email change",
          body: `<p>We received a request to change the email address on your account. Confirm the new address with the button below.</p>`,
          cta: "Confirm new address",
        },
        ja: {
          subject: "[BaroSit] 新しいメールアドレスをご確認ください",
          title: "メールアドレス変更の確認",
          body: `<p>アカウントのメールアドレス変更のリクエストを受け付けました。下のボタンから新しいアドレスを確認してください。</p>`,
          cta: "新しいアドレスを確認する",
        },
      };
      const x = t[lang];
      return { subject: x.subject, html: layout(lang, x.title, x.body + rawLink(lang, url), { label: x.cta, url }) };
    }

    case "magiclink":
    case "invite": {
      const t: Record<MailLang, { subject: string; title: string; body: string; cta: string }> = {
        ko: {
          subject: "[BaroSit] 로그인 링크",
          title: "아래 버튼으로 로그인하세요",
          body: `<p>비밀번호 없이 로그인할 수 있는 링크입니다. 보안을 위해 일정 시간이 지나면 만료됩니다.</p>`,
          cta: "BaroSit 로그인",
        },
        en: {
          subject: "[BaroSit] Your sign-in link",
          title: "Sign in with the button below",
          body: `<p>Here's your link to sign in without a password. For security, it expires after a short while.</p>`,
          cta: "Sign in to BaroSit",
        },
        ja: {
          subject: "[BaroSit] ログインリンク",
          title: "下のボタンからログインしてください",
          body: `<p>パスワードなしでログインできるリンクです。セキュリティのため、一定時間で期限切れになります。</p>`,
          cta: "BaroSit にログイン",
        },
      };
      const x = t[lang];
      return { subject: x.subject, html: layout(lang, x.title, x.body + rawLink(lang, url), { label: x.cta, url }) };
    }

    case "reauthentication": {
      const code = opts.token ?? "";
      const t: Record<MailLang, { subject: string; title: string; body: string }> = {
        ko: {
          subject: "[BaroSit] 본인 확인 코드",
          title: "본인 확인 코드",
          body: `<p>진행 중인 작업을 계속하려면 아래 코드를 입력해 주세요.</p>`,
        },
        en: {
          subject: "[BaroSit] Your verification code",
          title: "Your verification code",
          body: `<p>Enter the code below to continue what you were doing.</p>`,
        },
        ja: {
          subject: "[BaroSit] 本人確認コード",
          title: "本人確認コード",
          body: `<p>操作を続けるには、下のコードを入力してください。</p>`,
        },
      };
      const x = t[lang];
      const codeHtml = `<div style="text-align:center;margin:24px 0"><span style="display:inline-block;font-size:26px;font-weight:800;letter-spacing:0.22em;color:#0f172a;background:#f1f5f9;border-radius:10px;padding:14px 22px">${code}</span></div>`;
      return { subject: x.subject, html: layout(lang, x.title, x.body + codeHtml) };
    }
  }
}
