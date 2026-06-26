// 인앱 피드백 전송 (OPS-1)
// 저장소: 기존 admin_notifications 테이블을 재사용한다 (event_type='feedback').
//   - RLS: 누구나 INSERT 가능(비로그인 포함) + 어드민만 조회 (mig 20260521000003)
//   - 어드민 확인: AdminDashboard "실시간 알림(alerts)" 탭에서 realtime 으로 노출
// 전송 실패 시 호출측에서 feedbackMailtoFallback() 로 메일 폴백을 안내한다.

import { supabase } from "../auth/supabase";
import { platform } from "../platform";
import { loadLang } from "../i18n/lang";

export type FeedbackCategory = "bug" | "idea" | "other";

export interface FeedbackInput {
  category: FeedbackCategory;
  message: string;
  /** 비로그인 사용자가 회신을 원할 때 입력하는 선택 연락처 */
  email?: string;
}

export const SUPPORT_EMAIL = "support@barosit.com";

// 어드민 피드에서 한눈에 구분되도록 메시지 앞에 붙이는 태그 (어드민은 한국어)
const CATEGORY_TAG: Record<FeedbackCategory, string> = {
  bug: "🐞 버그",
  idea: "💡 제안",
  other: "💬 기타",
};

/** 진단에 도움이 되는 실행 컨텍스트 수집 (영상·민감정보 없음) */
async function gatherContext() {
  let appVersion = "";
  try {
    appVersion = await platform.getAppVersion();
  } catch {
    /* 버전 취득 실패는 무시 */
  }

  let userId: string | null = null;
  let accountEmail: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
    accountEmail = data.user?.email ?? null;
  } catch {
    /* 비로그인 / stub 클라이언트 */
  }

  let plan = "free";
  try {
    plan = localStorage.getItem("barosit:subscription_plan") || "free";
  } catch {
    /* localStorage 접근 불가 무시 */
  }

  return {
    user_id: userId,
    account_email: accountEmail,
    app_version: appVersion,
    client: platform.features.multiWindow ? "desktop" : "web",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    route:
      typeof window !== "undefined"
        ? window.location.hash || window.location.pathname
        : "",
    plan,
    lang: loadLang(),
  };
}

/**
 * 피드백을 admin_notifications 에 적재. 실패 시 에러를 throw 하므로
 * 호출측에서 catch 하여 메일 폴백을 안내한다.
 */
export async function submitFeedback(input: FeedbackInput): Promise<void> {
  const text = input.message.trim();
  if (!text) throw new Error("empty feedback");

  const ctx = await gatherContext();
  const message = `${CATEGORY_TAG[input.category]} · ${text}`;
  const payload = {
    kind: "feedback",
    category: input.category,
    contact_email: input.email?.trim() || ctx.account_email || null,
    ...ctx,
  };

  const { error } = await supabase.from("admin_notifications").insert({
    event_type: "feedback",
    severity: "info",
    message,
    payload,
  });
  if (error) throw new Error(error.message);
}

/** 전송 실패 시 사용할 메일 폴백 URL */
export function feedbackMailtoFallback(input: FeedbackInput): string {
  const subject = encodeURIComponent(`[BaroSit 피드백] ${input.category}`);
  const body = encodeURIComponent(input.message);
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}
