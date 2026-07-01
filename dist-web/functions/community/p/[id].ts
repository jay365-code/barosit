// Cloudflare Pages Function — 커뮤니티 글 상세 엣지 SSR.
// UGC 라 빌드타임 정적생성 불가 → 요청 시 Supabase 에서 글을 조회해 index.html 셸의
// head(title/description/canonical/og:*) 를 글별로 덮어쓰고, JSON-LD 와 크롤러용 <noscript>
// 본문을 주입한다. 브라우저에서는 동일 문서가 그대로 SPA 로 하이드레이션된다.
// 라우팅 범위는 public/_routes.json 이 /community/p/* 로 한정.

interface Env {
  ASSETS: { fetch: (input: RequestInfo | URL) => Promise<Response> };
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

// anon 키는 이미 클라 번들에 공개된 값(src/auth/supabase.ts) → env 미설정 시 폴백 허용.
const FALLBACK_SUPABASE_URL = "https://kllcnllkcewnutxodwhx.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbGNubGxrY2V3bnV0eG9kd2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNTY4MjksImV4cCI6MjA5NDgzMjgyOX0.nzl2oKDUpuAn0cDvG9oIpHNRVAuasYJixW4rapQVTOY";

const SITE = "https://barosit.com";
const NOTICE_CATEGORY = "📣 공지";
const BLOG_CATEGORY = "📝 블로그";
const QNA_CATEGORY = "❓ 질문/답변";
// 운영자 콘텐츠(공지·블로그)는 BlogPosting(Article)로 색인.
const EDITORIAL_CATEGORIES = [NOTICE_CATEGORY, BLOG_CATEGORY];

interface Post {
  id: string;
  title: string;
  content: string;
  author_name: string | null;
  category: string | null;
  created_at: string;
  likes: number | null;
  views: number | null;
  is_agent: boolean | null;
  agent_role: string | null;
  language: string | null;
  translation_group_id: string | null;
  comment_count: number | null;
}

// 언어별 상수: <title> 접미사, og:locale, hreflang 코드.
const LANG_SUFFIX: Record<string, string> = {
  ko: "BaroSit 커뮤니티",
  en: "BaroSit Community",
  ja: "BaroSit コミュニティ",
};
const OG_LOCALE: Record<string, string> = { ko: "ko_KR", en: "en_US", ja: "ja_JP" };
function langOf(p: { language: string | null }): string {
  return p.language && LANG_SUFFIX[p.language] ? p.language : "ko";
}

// ── 텍스트 유틸 ──────────────────────────────────────────────
// 마크다운/줄바꿈 제거 후 공백 collapse → meta description 용.
function stripMarkdown(s: string): string {
  return (s || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

// HTML 텍스트 컨텍스트(noscript 본문) 이스케이프.
function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// JSON-LD <script> 컨텍스트 이스케이프 — JSON.stringify 후 </script> 브레이크아웃 차단.
function jsonLdSafe(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function isNotice(p: Post): boolean {
  return p.category !== null && EDITORIAL_CATEGORIES.includes(p.category);
}

// 글 → JSON-LD 객체. 공지=BlogPosting, 질문=QAPage, 그 외 UGC=DiscussionForumPosting.
function buildJsonLd(p: Post, url: string): unknown {
  const cleanBody = stripMarkdown(p.content);
  const commentCount = p.comment_count ?? 0; // 공유 스레드 카운트(트리거 동기화)
  const author = p.is_agent
    ? { "@type": "Organization", name: "BaroSit" }
    : { "@type": "Person", name: p.author_name || "익명" };

  if (isNotice(p)) {
    return {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: truncate(p.title, 110),
      articleBody: cleanBody,
      datePublished: p.created_at,
      dateModified: p.created_at,
      author: { "@type": "Organization", name: "BaroSit" },
      publisher: {
        "@type": "Organization",
        name: "BaroSit",
        logo: { "@type": "ImageObject", url: `${SITE}/og-image.png` },
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      inLanguage: langOf(p),
      url,
    };
  }

  const interaction = [
    {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/LikeAction",
      userInteractionCount: p.likes ?? 0,
    },
    {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/CommentAction",
      userInteractionCount: commentCount,
    },
  ];

  if (p.category === QNA_CATEGORY) {
    return {
      "@context": "https://schema.org",
      "@type": "QAPage",
      mainEntity: {
        "@type": "Question",
        name: truncate(p.title, 110),
        text: cleanBody,
        dateCreated: p.created_at,
        author,
        answerCount: commentCount,
        interactionStatistic: interaction,
        url,
      },
      inLanguage: langOf(p),
    };
  }

  return {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: truncate(p.title, 110),
    articleBody: cleanBody,
    text: cleanBody,
    datePublished: p.created_at,
    author,
    interactionStatistic: interaction,
    inLanguage: langOf(p),
    url,
  };
}

// ── HTMLRewriter 핸들러 ──────────────────────────────────────
class AttrSetter {
  constructor(private attr: string, private value: string) {}
  element(el: Element) {
    el.setAttribute(this.attr, this.value);
  }
}

class TextSetter {
  constructor(private value: string) {}
  element(el: Element) {
    el.setInnerContent(this.value); // 기본 html:false → 텍스트 이스케이프
  }
}

// 정적 JSON-LD(SoftwareApplication·FAQPage)는 앱/랜딩 설명이라 글 permalink 에선 제거.
class Remover {
  element(el: Element) {
    el.remove();
  }
}

async function fetchPost(env: Env, id: string): Promise<Post | null> {
  const base = env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;
  const select =
    "id,title,content,author_name,category,created_at,likes,views,is_agent,agent_role,language,translation_group_id,comment_count";
  const url = `${base}/rest/v1/posts?id=eq.${encodeURIComponent(id)}&select=${encodeURIComponent(select)}&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Post[];
    return rows && rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

// 번역그룹 형제 글(언어별 id) — hreflang 대체 링크용.
async function fetchSiblings(
  env: Env,
  groupId: string,
): Promise<{ id: string; language: string }[]> {
  const base = env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;
  const url = `${base}/rest/v1/posts?translation_group_id=eq.${encodeURIComponent(groupId)}&select=id,language`;
  try {
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (!res.ok) return [];
    return (await res.json()) as { id: string; language: string }[];
  } catch {
    return [];
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { params, env, request } = context;
  const id = String(params.id || "");

  // 셸 로드 — 빌드된 index.html.
  const shell = await env.ASSETS.fetch(new URL("/index.html", request.url));

  const post = id ? await fetchPost(env, id) : null;
  const url = `${SITE}/community/p/${id}`;

  // 공통: 정적 JSON-LD 제거.
  let rewriter = new HTMLRewriter().on('script[type="application/ld+json"]', new Remover());

  if (!post) {
    const title = "게시글을 찾을 수 없습니다 — BaroSit 커뮤니티";
    const desc = "요청하신 커뮤니티 게시글을 찾을 수 없습니다.";
    rewriter = rewriter
      .on("title", new TextSetter(title))
      .on('meta[name="description"]', new AttrSetter("content", desc))
      .on('meta[property="og:title"]', new AttrSetter("content", title))
      .on('meta[property="og:description"]', new AttrSetter("content", desc))
      .on('meta[property="og:type"]', new AttrSetter("content", "website"))
      .on('meta[property="og:url"]', new AttrSetter("content", url))
      .on('link[rel="canonical"]', new AttrSetter("href", url));
    return new Response(rewriter.transform(shell).body, {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const lang = langOf(post);
  const title = `${post.title} — ${LANG_SUFFIX[lang]}`;
  const desc = truncate(stripMarkdown(post.content), 155);
  const jsonLd = jsonLdSafe(buildJsonLd(post, url));
  const authorLabel = post.is_agent ? "BaroSit" : post.author_name || "익명";
  const dateLabel = (post.created_at || "").slice(0, 10);

  // 다국어 hreflang 대체 링크(번역그룹 있을 때). anchor = 그룹 id(원본, 보통 KO) → x-default.
  const siblings = post.translation_group_id
    ? await fetchSiblings(env, post.translation_group_id)
    : [];
  let hreflangLinks = "";
  if (siblings.length > 1) {
    for (const s of siblings) {
      if (s.language) hreflangLinks += `<link rel="alternate" hreflang="${s.language}" href="${SITE}/community/p/${s.id}">`;
    }
    const anchor = siblings.find((s) => s.id === post.translation_group_id) || siblings[0];
    hreflangLinks += `<link rel="alternate" hreflang="x-default" href="${SITE}/community/p/${anchor.id}">`;
  }

  // 크롤러용 <noscript> 본문 — JS 켜진 브라우저/봇은 무시하고 SPA 하이드레이션.
  const noscript =
    `<noscript><article>` +
    `<h1>${escapeHtml(post.title)}</h1>` +
    `<p>${escapeHtml(authorLabel)} · ${escapeHtml(dateLabel)}` +
    (post.category ? ` · ${escapeHtml(post.category)}` : "") +
    `</p>` +
    `<div>${escapeHtml(post.content)}</div>` +
    `</article></noscript>`;

  rewriter = rewriter
    .on("html", new AttrSetter("lang", lang))
    .on("title", new TextSetter(title))
    .on('meta[name="description"]', new AttrSetter("content", desc))
    .on('meta[property="og:title"]', new AttrSetter("content", title))
    .on('meta[property="og:description"]', new AttrSetter("content", desc))
    .on('meta[property="og:type"]', new AttrSetter("content", "article"))
    .on('meta[property="og:url"]', new AttrSetter("content", url))
    .on('meta[property="og:locale"]', new AttrSetter("content", OG_LOCALE[lang]))
    .on('link[rel="canonical"]', new AttrSetter("href", url))
    .on("head", {
      element(el: Element) {
        if (hreflangLinks) el.append(hreflangLinks, { html: true });
        el.append(`<script type="application/ld+json">${jsonLd}</script>`, { html: true });
      },
    })
    .on("body", {
      element(el: Element) {
        el.prepend(noscript, { html: true });
      },
    });

  return new Response(rewriter.transform(shell).body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=300",
    },
  });
};
