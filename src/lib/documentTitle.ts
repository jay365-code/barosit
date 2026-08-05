import { useEffect } from "react";
import { useTranslation } from "react-i18next";

// index.html 의 <title> 은 ko 로 고정돼 있어, 앱에서 언어를 en/ja 로 바꿔도
// 브라우저 탭 제목만 한국어로 남았다(커뮤니티 글 상세만 예외적으로 스스로
// document.title 을 넣고 있었다). 화면별 제목을 현재 UI 언어로 채운다.
//
// key 가 null 이면 아무것도 하지 않는다 = "이 화면은 제목을 스스로 관리한다".
// 정적 <title> 은 그대로 둔다 — 크롤러가 읽는 값이라 SEO 를 건드리지 않기 위함.
export function useDocumentTitle(key: string | null, ns: string = "marketing") {
  const { t, i18n } = useTranslation(ns);
  useEffect(() => {
    if (!key || typeof document === "undefined") return;
    document.title = t(key);
  }, [key, t, i18n.language]);
}
