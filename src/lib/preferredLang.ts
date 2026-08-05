// 거래 메일(결제 실패·환불·탈퇴 등)은 서버(Edge Function)에서 나가는데,
// UI 언어는 localStorage 에만 있어 서버가 알 방법이 없었다 — 그래서 전부
// 한국어로 발송됐다. 로그인 사용자의 선택을 profiles.preferred_lang 에
// 올려두고, 메일 템플릿이 그 값을 읽는다(_shared/email.ts userMailLang).
//
// 실패는 조용히 무시한다. 이건 부가 정보라 로그인·언어 변경을 막으면 안 된다.
import { supabase } from "../auth/supabase";
import i18n from "../i18n";

const SUPPORTED = ["ko", "en", "ja"] as const;
type Lang = (typeof SUPPORTED)[number];

function currentLang(): Lang {
  const base = (i18n.language || "ko").split("-")[0];
  return (SUPPORTED as readonly string[]).includes(base) ? (base as Lang) : "ko";
}

// 같은 값을 반복해서 쓰지 않도록(언어 변경 이벤트는 창마다 발화한다).
let lastWritten: string | null = null;

export async function syncPreferredLang(userId?: string | null): Promise<void> {
  try {
    let uid = userId ?? null;
    if (!uid) {
      const { data } = await supabase.auth.getSession();
      uid = data.session?.user?.id ?? null;
    }
    if (!uid) return;

    const lang = currentLang();
    const key = `${uid}:${lang}`;
    if (key === lastWritten) return;

    const { error } = await supabase
      .from("profiles")
      .update({ preferred_lang: lang })
      .eq("id", uid);
    if (error) {
      console.warn("[preferredLang] 저장 실패(무시):", error.message);
      return;
    }
    lastWritten = key;
  } catch (e) {
    console.warn("[preferredLang] 저장 예외(무시):", e);
  }
}

// 언어를 바꾸면 즉시 반영. 로그인 시점 동기화는 useAuth 가 호출한다.
let subscribed = false;
export function initPreferredLangSync(): void {
  if (subscribed) return;
  subscribed = true;
  i18n.on("languageChanged", () => {
    void syncPreferredLang();
  });
}
