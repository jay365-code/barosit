// 결제 라이프사이클 사용자 알림 이메일 (§11 H2). Resend API 재사용.
//
// RESEND_API_KEY 미설정 시 조용히 건너뛴다 — 알림 실패가 결제/더닝 본 로직을
// 막아서는 안 된다(이메일은 부가 채널). 발송 결과 boolean 반환.
//
// 언어: 모든 템플릿이 첫 인자로 lang 을 받는다. 호출부는 userMailLang() 로
// profiles.preferred_lang 을 읽어 넘긴다(없으면 ko — 그 컬럼이 생기기 전
// 가입자는 한국어 UI 사용자였다).

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = "BaroSit <support@barosit.com>";

export type MailLang = "ko" | "en" | "ja";

const LOCALE: Record<MailLang, string> = { ko: "ko-KR", en: "en-US", ja: "ja-JP" };

export function normalizeMailLang(raw: unknown): MailLang {
  const base = String(raw ?? "").split("-")[0].toLowerCase();
  return base === "en" || base === "ja" ? base : "ko";
}

// 수신자의 UI 언어. 조회 실패는 치명적이지 않으므로 ko 로 떨어진다.
export async function userMailLang(
  supabase: { from: (t: string) => any },
  userId: string | null | undefined,
): Promise<MailLang> {
  if (!userId) return "ko";
  try {
    const { data } = await supabase
      .from("profiles")
      .select("preferred_lang")
      .eq("id", userId)
      .maybeSingle();
    return normalizeMailLang(data?.preferred_lang);
  } catch (e) {
    console.warn("[email] 언어 조회 실패 — ko 로 발송:", e);
    return "ko";
  }
}

export async function sendUserEmail(to: string | null | undefined, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY 미설정 — 이메일 생략:", subject);
    return false;
  }
  if (!to) {
    console.warn("[email] 수신자 없음 — 생략:", subject);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error("[email] 발송 실패:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] 발송 예외:", e);
    return false;
  }
}

function fmtDate(iso: string | null | undefined, lang: MailLang, fallback: string): string {
  if (!iso) return fallback;
  return new Date(iso).toLocaleDateString(LOCALE[lang]);
}

// 결제는 토스(국내 카드) 전용이라 통화는 항상 KRW.
function fmtAmount(amount: number, lang: MailLang): string {
  const n = amount.toLocaleString(LOCALE[lang]);
  if (lang === "en") return `KRW ${n}`;
  if (lang === "ja") return `${n}ウォン`;
  return `${n}원`;
}

const FOOTER: Record<MailLang, string> = {
  ko: "본 메일은 발신전용입니다. 문의는 support@barosit.com 으로 보내주세요.",
  en: "This is a send-only address. For questions, please email support@barosit.com.",
  ja: "本メールは送信専用です。お問い合わせは support@barosit.com までお願いいたします。",
};

// 공통 레이아웃 래퍼 (send-inquiry-email 스타일과 일관)
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
    <div style="font-size:11px;color:#94a3b8;margin-top:36px;text-align:center;border-top:1px solid #f1f5f9;padding-top:18px">
      ${FOOTER[lang]}
    </div>
  </div>`;
}

const BILLING_URL = "https://barosit.com/#/pricing";

// 결제 실패 → 유예 시작 안내 (카드 갱신 유도)
export function tplPaymentFailed(lang: MailLang, graceUntilIso?: string | null): { subject: string; html: string } {
  const until = fmtDate(graceUntilIso, lang, { ko: "약 7일 후", en: "about 7 days from now", ja: "約7日後" }[lang]);
  const body: Record<MailLang, { subject: string; title: string; html: string; cta: string }> = {
    ko: {
      subject: "[BaroSit] 정기결제가 실패했어요 — 카드 정보를 확인해 주세요",
      title: "정기결제에 실패했습니다",
      html: `<p>등록하신 카드로 PRO 구독 정기결제가 처리되지 않았습니다(한도 초과·유효기간 만료 등).</p>
       <p><strong>${until}까지 유예기간</strong> 동안에는 PRO 기능을 계속 이용하실 수 있습니다.
       기간 내에 결제 수단을 갱신해 주시면 구독이 정상 유지되며, 갱신이 없으면 FREE 등급으로 전환됩니다.</p>`,
      cta: "결제 수단 갱신하기",
    },
    en: {
      subject: "[BaroSit] Your subscription payment failed — please check your card",
      title: "We couldn't process your subscription payment",
      html: `<p>Your PRO subscription payment could not be processed with the card on file (insufficient limit, expired card, and so on).</p>
       <p>You can keep using PRO features during the <strong>grace period, which runs until ${until}</strong>.
       Update your payment method within that window and your subscription continues as normal; if it isn't updated, your account moves to the FREE tier.</p>`,
      cta: "Update payment method",
    },
    ja: {
      subject: "[BaroSit] 定期決済に失敗しました — カード情報をご確認ください",
      title: "定期決済に失敗しました",
      html: `<p>ご登録のカードで PRO サブスクリプションの定期決済を処理できませんでした（限度額超過・有効期限切れなど）。</p>
       <p><strong>${until}までの猶予期間</strong>中は PRO 機能をそのままご利用いただけます。
       期間内に支払い方法を更新いただければ購読はそのまま継続され、更新がない場合は FREE プランに移行します。</p>`,
      cta: "支払い方法を更新する",
    },
  };
  const b = body[lang];
  return { subject: b.subject, html: layout(lang, b.title, b.html, { label: b.cta, url: BILLING_URL }) };
}

// 유예 만료 → FREE 강등 안내
export function tplDowngraded(lang: MailLang): { subject: string; html: string } {
  const body: Record<MailLang, { subject: string; title: string; html: string; cta: string }> = {
    ko: {
      subject: "[BaroSit] 구독이 FREE 등급으로 전환되었습니다",
      title: "PRO 구독이 종료되었습니다",
      html: `<p>정기결제 유예기간이 만료되어 구독이 <strong>FREE 등급으로 전환</strong>되었습니다.
       그동안 BaroSit PRO 를 이용해 주셔서 감사합니다.</p>
       <p>다시 PRO 기능(백그라운드 지속 관제, 클라우드 동기화 등)을 이용하시려면 언제든 재구독하실 수 있습니다.</p>`,
      cta: "PRO 다시 시작하기",
    },
    en: {
      subject: "[BaroSit] Your subscription moved to the FREE tier",
      title: "Your PRO subscription has ended",
      html: `<p>The grace period for your subscription payment expired, so your account has <strong>moved to the FREE tier</strong>.
       Thank you for using BaroSit PRO.</p>
       <p>You can resubscribe at any time to get PRO features (continuous background monitoring, cloud sync, and more) back.</p>`,
      cta: "Start PRO again",
    },
    ja: {
      subject: "[BaroSit] サブスクリプションが FREE プランに移行しました",
      title: "PRO サブスクリプションが終了しました",
      html: `<p>定期決済の猶予期間が終了したため、サブスクリプションが <strong>FREE プランに移行</strong>しました。
       これまで BaroSit PRO をご利用いただきありがとうございました。</p>
       <p>PRO 機能（バックグラウンドでの継続モニタリング、クラウド同期など）は、いつでも再購読してご利用いただけます。</p>`,
      cta: "PRO を再開する",
    },
  };
  const b = body[lang];
  return { subject: b.subject, html: layout(lang, b.title, b.html, { label: b.cta, url: BILLING_URL }) };
}

// 환불 완료 안내
export function tplRefunded(lang: MailLang, amount: number, full: boolean): { subject: string; html: string } {
  const money = fmtAmount(amount, lang);
  const body: Record<MailLang, { subject: string; title: string; html: string }> = {
    ko: {
      subject: "[BaroSit] 환불이 완료되었습니다",
      title: `${full ? "전액" : "부분"} 환불이 완료되었습니다`,
      html: `<p>요청하신 결제 건에 대해 <strong>${money}</strong>이 환불 처리되었습니다.
       카드사 정책에 따라 영업일 기준 3~5일 내 카드 명세서에 반영됩니다.</p>
       <p>이용에 불편을 드렸다면 죄송합니다. 다시 찾아주시길 기다리겠습니다.</p>`,
    },
    en: {
      subject: "[BaroSit] Your refund has been processed",
      title: `Your ${full ? "full" : "partial"} refund has been processed`,
      html: `<p>We've refunded <strong>${money}</strong> for the payment you asked about.
       Depending on your card issuer's policy, it should appear on your statement within 3–5 business days.</p>
       <p>We're sorry if anything about the experience fell short. We'd be glad to see you back.</p>`,
    },
    ja: {
      subject: "[BaroSit] 返金が完了しました",
      title: `${full ? "全額" : "一部"}返金が完了しました`,
      html: `<p>ご依頼のお支払いについて <strong>${money}</strong> を返金いたしました。
       カード会社の規定により、営業日ベースで3〜5日以内にご利用明細へ反映されます。</p>
       <p>ご不便をおかけしていましたら申し訳ありません。またのご利用をお待ちしております。</p>`,
    },
  };
  const b = body[lang];
  return { subject: b.subject, html: layout(lang, b.title, b.html) };
}

// 회원탈퇴 신청 접수 안내 (유예 시작)
export function tplDeletionRequested(lang: MailLang, scheduledIso?: string | null): { subject: string; html: string } {
  const when = fmtDate(scheduledIso, lang, { ko: "약 30일 후", en: "about 30 days from now", ja: "約30日後" }[lang]);
  const body: Record<MailLang, { subject: string; title: string; html: string; cta: string }> = {
    ko: {
      subject: "[BaroSit] 회원탈퇴가 접수되었습니다",
      title: "회원탈퇴 신청이 접수되었습니다",
      html: `<p>요청하신 회원탈퇴가 정상 접수되었습니다. <strong>${when}에 계정과 개인정보·자세 데이터가 영구 삭제</strong>됩니다.</p>
       <p>그 전까지는 <strong>유예기간</strong>으로, 다시 로그인하신 뒤 "탈퇴 취소"를 누르시면 계정을 그대로 복구하실 수 있습니다.
       이용 중이던 PRO 구독은 추가 청구 없이 자동갱신이 해지되었습니다.</p>
       <p style="color:#64748b;font-size:13px">※ 전자상거래법에 따라 결제·거래 기록은 식별정보를 분리(익명화)한 뒤 법정 보존기간(5년) 동안 보관됩니다.</p>`,
      cta: "BaroSit 다시 열기",
    },
    en: {
      subject: "[BaroSit] Your account deletion request has been received",
      title: "We've received your account deletion request",
      html: `<p>Your deletion request has been accepted. <strong>On ${when}, your account, personal information, and posture data will be permanently deleted.</strong></p>
       <p>Until then you're in a <strong>grace period</strong> — sign in again and press "Cancel deletion" to restore your account exactly as it was.
       Any PRO subscription has had auto-renewal cancelled, with no further charges.</p>
       <p style="color:#64748b;font-size:13px">※ Under Korean e-commerce law, payment and transaction records are kept for the statutory retention period (5 years) after identifying information is separated (anonymized).</p>`,
      cta: "Open BaroSit again",
    },
    ja: {
      subject: "[BaroSit] 退会申請を受け付けました",
      title: "退会申請を受け付けました",
      html: `<p>ご依頼の退会を受け付けました。<strong>${when}にアカウントと個人情報・姿勢データが完全に削除</strong>されます。</p>
       <p>それまでは<strong>猶予期間</strong>です。再度ログインして「退会を取り消す」を押していただければ、アカウントをそのまま復元できます。
       ご利用中だった PRO サブスクリプションは、追加請求なしで自動更新が解除されています。</p>
       <p style="color:#64748b;font-size:13px">※ 韓国の電子商取引法に基づき、決済・取引記録は識別情報を分離（匿名化）したうえで法定保存期間（5年）保管されます。</p>`,
      cta: "BaroSit をもう一度開く",
    },
  };
  const b = body[lang];
  return { subject: b.subject, html: layout(lang, b.title, b.html, { label: b.cta, url: BILLING_URL }) };
}

// 회원탈퇴 취소(복구) 안내
export function tplDeletionCanceled(lang: MailLang): { subject: string; html: string } {
  const body: Record<MailLang, { subject: string; title: string; html: string }> = {
    ko: {
      subject: "[BaroSit] 회원탈퇴가 취소되었습니다",
      title: "회원탈퇴가 취소되었습니다",
      html: `<p>예약되어 있던 회원탈퇴가 <strong>취소</strong>되어 계정이 정상 상태로 복구되었습니다.
       계정과 데이터는 그대로 유지됩니다.</p>
       <p>다시 찾아주셔서 감사합니다. 계속 바른 자세를 함께 지켜드릴게요.</p>`,
    },
    en: {
      subject: "[BaroSit] Your account deletion has been cancelled",
      title: "Your account deletion has been cancelled",
      html: `<p>The scheduled deletion has been <strong>cancelled</strong> and your account is back to normal.
       Your account and data are intact.</p>
       <p>Thanks for coming back. We'll keep looking after your posture with you.</p>`,
    },
    ja: {
      subject: "[BaroSit] 退会が取り消されました",
      title: "退会が取り消されました",
      html: `<p>予約されていた退会が<strong>取り消され</strong>、アカウントが通常の状態に戻りました。
       アカウントとデータはそのまま維持されます。</p>
       <p>また戻ってきてくださりありがとうございます。これからも一緒に良い姿勢を守っていきましょう。</p>`,
    },
  };
  const b = body[lang];
  return { subject: b.subject, html: layout(lang, b.title, b.html) };
}

// 구독 해지(예약) 접수 안내
export function tplCanceled(lang: MailLang, periodEndIso?: string | null): { subject: string; html: string } {
  const end = fmtDate(periodEndIso, lang, {
    ko: "현재 결제 주기 만료일",
    en: "the end of your current billing period",
    ja: "現在の請求期間の満了日",
  }[lang]);
  const body: Record<MailLang, { subject: string; title: string; html: string; cta: string }> = {
    ko: {
      subject: "[BaroSit] 구독 해지가 예약되었습니다",
      title: "구독 해지가 접수되었습니다",
      html: `<p>구독 해지가 정상 접수되었습니다. <strong>${end}까지</strong> PRO 기능을 그대로 이용하실 수 있으며,
       만료일에 추가 청구 없이 FREE 등급으로 전환됩니다.</p>
       <p>마음이 바뀌시면 만료 전 언제든 해지를 철회(재개)하실 수 있습니다.</p>`,
      cta: "구독 관리",
    },
    en: {
      subject: "[BaroSit] Your subscription cancellation is scheduled",
      title: "We've received your cancellation",
      html: `<p>Your cancellation has been accepted. You can keep using PRO features <strong>until ${end}</strong>,
       and on that date your account moves to the FREE tier with no further charges.</p>
       <p>If you change your mind, you can undo the cancellation (resume) any time before then.</p>`,
      cta: "Manage subscription",
    },
    ja: {
      subject: "[BaroSit] 解約の予約を受け付けました",
      title: "解約を受け付けました",
      html: `<p>解約を受け付けました。<strong>${end}まで</strong> PRO 機能をそのままご利用いただけ、
       満了日に追加請求なしで FREE プランに移行します。</p>
       <p>お気が変わった場合は、満了日前ならいつでも解約を取り消して（再開して）いただけます。</p>`,
      cta: "サブスクリプション管理",
    },
  };
  const b = body[lang];
  return { subject: b.subject, html: layout(lang, b.title, b.html, { label: b.cta, url: BILLING_URL }) };
}
