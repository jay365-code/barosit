// Cloudflare Pages Function — 커뮤니티 목록(/community) 엣지 SSR.
// 목록 페이지를 크롤 가능한 clean URL 로 만들고, <noscript> 에 글 permalink 링크를 나열해
// 크롤러가 개별 글(/community/p/<id>)을 발견하도록 한다. 브라우저는 SPA 로 하이드레이션.
import {
  Env,
  SITE,
  supabaseCreds,
  escapeHtml,
  jsonLdSafe,
  truncate,
} from "../_shared/ssr";

interface PostRow {
  id: string;
  title: string;
  category: string | null;
  author_name: string | null;
  created_at: string;
}

async function fetchRecentPosts(env: Env): Promise<PostRow[]> {
  const { base, key } = supabaseCreds(env);
  const select = "id,title,category,author_name,created_at";
  const url = `${base}/rest/v1/posts?select=${encodeURIComponent(select)}&order=created_at.desc&limit=200`;
  try {
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (!res.ok) return [];
    return (await res.json()) as PostRow[];
  } catch {
    return [];
  }
}

class AttrSetter {
  constructor(private attr: string, private value: string) {}
  element(el: Element) {
    el.setAttribute(this.attr, this.value);
  }
}
class TextSetter {
  constructor(private value: string) {}
  element(el: Element) {
    el.setInnerContent(this.value);
  }
}
class Remover {
  element(el: Element) {
    el.remove();
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  const shell = await env.ASSETS.fetch(new URL("/index.html", request.url));
  const posts = await fetchRecentPosts(env);

  const url = `${SITE}/community`;
  const title = "커뮤니티 — BaroSit 바로씻";
  const desc =
    "BaroSit 사용자들의 자세 꿀팁·기능 제안·질문과 답변. 거북목·데스크워크 자세 관리 이야기를 나누는 공간.";

  const itemList = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description: desc,
    url,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: posts.slice(0, 50).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE}/community/p/${p.id}`,
        name: truncate(p.title || "", 110),
      })),
    },
  };

  // 크롤러용 글 목록 링크 — SPA 하이드레이션이 대체.
  const noscriptList =
    `<noscript><section><h1>${escapeHtml(title)}</h1><ul>` +
    posts
      .map(
        (p) =>
          `<li><a href="/community/p/${escapeHtml(p.id)}">${escapeHtml(p.title || "")}</a>` +
          (p.category ? ` — ${escapeHtml(p.category)}` : "") +
          `</li>`,
      )
      .join("") +
    `</ul></section></noscript>`;

  const rewriter = new HTMLRewriter()
    .on('script[type="application/ld+json"]', new Remover())
    .on("title", new TextSetter(title))
    .on('meta[name="description"]', new AttrSetter("content", desc))
    .on('meta[property="og:title"]', new AttrSetter("content", title))
    .on('meta[property="og:description"]', new AttrSetter("content", desc))
    .on('meta[property="og:type"]', new AttrSetter("content", "website"))
    .on('meta[property="og:url"]', new AttrSetter("content", url))
    .on('link[rel="canonical"]', new AttrSetter("href", url))
    .on("head", {
      element(el: Element) {
        el.append(`<script type="application/ld+json">${jsonLdSafe(itemList)}</script>`, {
          html: true,
        });
      },
    })
    .on("body", {
      element(el: Element) {
        el.prepend(noscriptList, { html: true });
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
