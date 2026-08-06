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

    // Auth 메일(가입 확인·비밀번호 재설정)은 Supabase 가 자기 템플릿으로 보내고,
    // 템플릿이 볼 수 있는 값은 user_metadata(`{{ .Data }}`) 뿐이다. profiles 로는
    // 닿지 않으므로 같은 값을 메타데이터에도 둔다 — 가입 이전 사용자의 백필도
    // 이 경로로 자연히 이뤄진다.
    await syncAuthMetadataLang(lang);
  } catch (e) {
    console.warn("[preferredLang] 저장 예외(무시):", e);
  }
}

// 값이 이미 같으면 쓰지 않는다. updateUser 는 USER_UPDATED 를 발화시켜
// onAuthStateChange → syncPreferredLang 로 되돌아오므로, 이 비교가 루프를 끊는다.
async function syncAuthMetadataLang(lang: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    if (data.user.user_metadata?.lang === lang) return;
    const { error } = await supabase.auth.updateUser({ data: { lang } });
    if (error) console.warn("[preferredLang] 메타데이터 저장 실패(무시):", error.message);
  } catch (e) {
    console.warn("[preferredLang] 메타데이터 저장 예외(무시):", e);
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
