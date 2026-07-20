// Cloudflare Pages Function — 블로그 RSS 피드(/rss.xml).
// 네이버 서치어드바이저는 사이트맵보다 RSS 제출 시 수집 주기가 짧아, 신규 글 발견용으로 별도 제공.
// UGC 잡담이 섞이면 피드 품질이 떨어지므로 운영자 콘텐츠(공지·블로그)만 싣는다.
import { Env, SITE, supabaseCreds, escapeXml, stripMarkdown, truncate } from "./_shared/ssr";

const EDITORIAL_CATEGORIES = ["📣 공지", "📝 블로그"];

interface Row {
  id: string;
  title: string;
  content: string;
  category: string | null;
  created_at: string;
  language: string | null;
}

const CHANNEL_TITLE: Record<string, string> = {
  ko: "BaroSit 바로씻 — 자세 이야기",
  en: "BaroSit — Posture Notes",
  ja: "BaroSit — 姿勢のはなし",
};
const CHANNEL_DESC: Record<string, string> = {
  ko: "거북목·데스크워크 자세를 연구 근거로 풀어쓴 BaroSit 블로그.",
  en: "Research-backed notes on forward-head posture and desk work, from BaroSit.",
  ja: "猫背やデスクワークの姿勢を研究にもとづいて解説する BaroSit ブログ。",
};

function rfc822(s: string): string | null {
  const ts = Date.parse(s || "");
  return Number.isNaN(ts) ? null : new Date(ts).toUTCString();
}

async function build(context: { env: Env; request: Request }) {
  const { env, request } = context;
  const { base, key } = supabaseCreds(env);

  const qlang = new URL(request.url).searchParams.get("lang") || "ko";
  const lang = CHANNEL_TITLE[qlang] ? qlang : "ko";

  // 카테고리 필터는 PostgREST in.() 이모지 인용이 까다로워 JS 쪽에서 거른다.
  const select = "id,title,content,category,created_at,language";
  const url =
    `${base}/rest/v1/posts?select=${encodeURIComponent(select)}` +
    `&language=eq.${encodeURIComponent(lang)}&order=created_at.desc&limit=200`;

  let rows: Row[] = [];
  try {
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (res.ok) rows = (await res.json()) as Row[];
  } catch {
    rows = [];
  }

  const posts = rows
    .filter((r) => r.category !== null && EDITORIAL_CATEGORIES.includes(r.category))
    .slice(0, 50);

  const items = posts
    .map((p) => {
      const link = `${SITE}/community/p/${p.id}`;
      const pub = rfc822(p.created_at);
      return (
        `    <item>\n` +
        `      <title>${escapeXml(p.title || "")}</title>\n` +
        `      <link>${escapeXml(link)}</link>\n` +
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>\n` +
        (pub ? `      <pubDate>${pub}</pubDate>\n` : "") +
        (p.category ? `      <category>${escapeXml(p.category)}</category>\n` : "") +
        `      <description>${escapeXml(truncate(stripMarkdown(p.content || ""), 300))}</description>\n` +
        `    </item>`
      );
    })
    .join("\n");

  const built = rfc822(posts[0]?.created_at || "");
  const self = `${SITE}/rss.xml${lang === "ko" ? "" : `?lang=${lang}`}`;
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `  <channel>\n` +
    `    <title>${escapeXml(CHANNEL_TITLE[lang])}</title>\n` +
    `    <link>${SITE}/community</link>\n` +
    `    <description>${escapeXml(CHANNEL_DESC[lang])}</description>\n` +
    `    <language>${lang}</language>\n` +
    (built ? `    <lastBuildDate>${built}</lastBuildDate>\n` : "") +
    `    <atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml"/>\n` +
    `${items}\n` +
    `  </channel>\n` +
    `</rss>\n`;

  const ts = Date.parse(posts[0]?.created_at || "");
  return {
    xml,
    etag: `W/"${lang}-${posts.length}-${Number.isNaN(ts) ? 0 : ts}"`,
    lastModified: Number.isNaN(ts) ? null : new Date(ts).toUTCString(),
  };
}

function headers(etag: string, lastModified: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "content-type": "application/rss+xml; charset=utf-8",
    "cache-control": "public, max-age=0, s-maxage=600",
    etag,
  };
  if (lastModified) h["last-modified"] = lastModified;
  return h;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { xml, etag, lastModified } = await build(context);
  if (context.request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: headers(etag, lastModified) });
  }
  return new Response(xml, { status: 200, headers: headers(etag, lastModified) });
};

export const onRequestHead: PagesFunction<Env> = async (context) => {
  const { etag, lastModified } = await build(context);
  return new Response(null, { status: 200, headers: headers(etag, lastModified) });
};
