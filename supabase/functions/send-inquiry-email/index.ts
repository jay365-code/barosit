import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 문의자에게 나가는 접수 확인 메일. 문의를 남긴 사람의 언어로 보낸다
// (inquiries.lang). 관리자 알림 메일은 내부용이라 한국어 고정.
// lang 이 비어 있으면 ko — 이 컬럼이 없던 시절의 행은 전부 한국어 문의였다.
type InquiryLang = "ko" | "en" | "ja";

const CUSTOMER_STRINGS: Record<InquiryLang, {
  subject: string;
  greeting: string;
  intro: string;
  receiptTitle: string;
  typeLabel: string;
  replyNotice: string;
  closing: string;
  signature: string;
  footer: string;
}> = {
  ko: {
    subject: "[BaroSit] 문의 사항이 정상적으로 접수되었습니다.",
    greeting: "안녕하세요, BaroSit 고객지원팀입니다.",
    intro:
      "보내주신 소중한 문의 사항이 안전하게 접수 완료되었습니다.<br/>남겨주신 의견과 제안을 꼼꼼하게 검토하여 신속하게 답변드릴 수 있도록 하겠습니다.",
    receiptTitle: "📋 접수 정보",
    typeLabel: "문의 유형",
    replyNotice:
      "답변은 영업일 기준 최대 7일 이내에 작성해 주신 메일 주소로 상세히 회신해 드리겠습니다. 버그 제보의 경우 내부 재현 테스트 상태에 따라 분석 시간이 조금 더 걸릴 수 있는 점 양해 부탁드립니다.",
    closing: "감사합니다.",
    signature: "BaroSit 팀 드림",
    footer: "본 메일은 발신전용입니다. 추가 문의는 웹사이트의 문의 페이지를 통해 다시 접수해 주세요.",
  },
  en: {
    subject: "[BaroSit] We've received your inquiry",
    greeting: "Hello, this is the BaroSit support team.",
    intro:
      "Your inquiry has been received.<br/>We'll read through your feedback carefully and get back to you as soon as we can.",
    receiptTitle: "📋 What we received",
    typeLabel: "Inquiry type",
    replyNotice:
      "We'll reply in detail to the email address you provided within 7 business days at the latest. For bug reports, analysis may take a little longer depending on how quickly we can reproduce the issue — thank you for your patience.",
    closing: "Thank you.",
    signature: "The BaroSit team",
    footer: "This is a send-only address. For further questions, please submit another inquiry from our website.",
  },
  ja: {
    subject: "[BaroSit] お問い合わせを受け付けました",
    greeting: "こんにちは。BaroSit カスタマーサポートです。",
    intro:
      "お送りいただいたお問い合わせを受け付けました。<br/>いただいたご意見・ご提案をしっかり確認し、できるだけ早くご返信いたします。",
    receiptTitle: "📋 受付内容",
    typeLabel: "お問い合わせ種別",
    replyNotice:
      "ご記入いただいたメールアドレス宛に、営業日ベースで最大7日以内に詳しくご返信いたします。不具合のご報告については、再現確認の状況により分析にもう少しお時間をいただく場合がございます。ご了承ください。",
    closing: "ありがとうございます。",
    signature: "BaroSit チーム",
    footer: "本メールは送信専用です。追加のお問い合わせはウェブサイトのお問い合わせページからお願いいたします。",
  },
};

function normalizeLang(raw: unknown): InquiryLang {
  const base = String(raw ?? "").split("-")[0].toLowerCase();
  return base === "en" || base === "ja" ? base : "ko";
}

serve(async (req) => {
  // CORS OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY environment variable is not set.");
    }

    const payload = await req.json();
    console.log("Received webhook payload:", JSON.stringify(payload));

    // Webhook event type이 INSERT일 때만 동작하도록 분기
    if (payload.type !== "INSERT") {
      return new Response(
        JSON.stringify({ message: `Skipping event type: ${payload.type}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const record = payload.record;
    if (!record) {
      throw new Error("No record found in payload");
    }

    const { email, type, message } = record;
    const lang = normalizeLang(record.lang);
    const s = CUSTOMER_STRINGS[lang];

    // 1. 관리자 알림용 이메일 발송
    const adminEmailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "BaroSit Support <support@barosit.com>",
        to: ["jhlee@gubed.co.kr"],
        subject: `[BaroSit 신규 문의] ${type}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #eaeaea; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
            <h2 style="color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 12px; margin-top: 0; font-size: 20px; font-weight: 800;">🛎️ 신규 문의가 접수되었습니다.</h2>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: 700; color: #64748b; width: 120px;">작성자 이메일</td>
                <td style="padding: 10px 0; color: #0f172a;"><a href="mailto:${email}" style="color: #3b82f6; text-decoration: none; font-weight: 600;">${email}</a></td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: 700; color: #64748b;">문의 유형</td>
                <td style="padding: 10px 0; color: #0f172a; font-weight: 700;">${type}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: 700; color: #64748b;">작성 언어</td>
                <td style="padding: 10px 0; color: #0f172a; font-weight: 700;">${lang}</td>
              </tr>
            </table>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin-top: 15px;">
              <h4 style="margin-top: 0; margin-bottom: 12px; color: #475569; font-size: 14px; font-weight: 700;">💬 문의 내용</h4>
              <p style="margin: 0; line-height: 1.6; white-space: pre-wrap; color: #334155; font-size: 14px;">${message}</p>
            </div>
            <p style="font-size: 11px; color: #94a3b8; margin-top: 30px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px; margin-bottom: 0;">
              본 이메일은 BaroSit 데이터베이스 Webhook 트리거를 통해 Deno Edge Function에서 전송되었습니다.
            </p>
          </div>
        `,
      }),
    });

    const adminResult = await adminEmailResponse.json();
    console.log("Admin email dispatch result:", adminResult);

    if (!adminEmailResponse.ok) {
      throw new Error(`Failed to send admin email: ${JSON.stringify(adminResult)}`);
    }

    // 2. 고객 자동 응답용 이메일 발송
    const customerEmailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "BaroSit Support <support@barosit.com>",
        to: [email],
        subject: s.subject,
        html: `
          <div lang="${lang}" style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px 25px; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.02);">
            <div style="text-align: center; padding-bottom: 24px; border-bottom: 1px solid #f1f5f9; margin-bottom: 24px;">
              <span style="font-size: 24px; font-weight: 900; color: #0f172a; letter-spacing: -0.04em;">barosit</span>
            </div>
            <h2 style="color: #0f172a; font-weight: 700; margin-top: 0; font-size: 18px; line-height: 1.4;">${s.greeting}</h2>
            <p style="line-height: 1.6; color: #334155; font-size: 14px; margin-top: 8px;">
              ${s.intro}
            </p>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 24px 0;">
              <h4 style="margin-top: 0; margin-bottom: 12px; color: #475569; font-size: 13px; font-weight: 700; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">${s.receiptTitle}</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 14px;">
                <tr>
                  <td style="padding: 6px 0; font-weight: 700; color: #64748b; width: 100px;">${s.typeLabel}</td>
                  <td style="padding: 6px 0; color: #334155; font-weight: 600;">${type}</td>
                </tr>
              </table>
              <p style="margin: 0; line-height: 1.6; white-space: pre-wrap; color: #475569; font-size: 13px; font-style: italic;">${message}</p>
            </div>
            <p style="line-height: 1.6; color: #334155; font-size: 14px;">
              ${s.replyNotice}
            </p>
            <p style="line-height: 1.6; color: #0f172a; margin-top: 24px; font-size: 14px;">
              ${s.closing}<br/>
              <strong style="color: #3b82f6;">${s.signature}</strong>
            </p>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 40px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px; margin-bottom: 0;">
              ${s.footer}
            </div>
          </div>
        `,
      }),
    });

    const customerResult = await customerEmailResponse.json();
    console.log("Customer email dispatch result:", customerResult);

    if (!customerEmailResponse.ok) {
      throw new Error(`Failed to send customer email: ${JSON.stringify(customerResult)}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Emails sent successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Error inside Edge Function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
