// Cloudflare Pages Function — 동적 커뮤니티 사이트맵(/community-sitemap.xml).
// UGC 라 빌드타임 정적 사이트맵 불가 → 요청 시 글 목록을 조회해 permalink urlset 생성.
// robots.txt 에 이 사이트맵을 등록해 크롤러가 전체 글을 발견하도록 한다.
import { Env, SITE, supabaseCreds, escapeXml } from "./_shared/ssr";

interface Row {
  id: string;
  created_at: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context;
  const { base, key } = supabaseCreds(env);
  const url = `${base}/rest/v1/posts?select=id,created_at&order=created_at.desc&limit=5000`;

  let rows: Row[] = [];
  try {
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (res.ok) rows = (await res.json()) as Row[];
  } catch {
    rows = [];
  }

  const urls = [
    `  <url><loc>${SITE}/community</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>`,
    ...rows.map((r) => {
      const lastmod = (r.created_at || "").slice(0, 10);
      return (
        `  <url><loc>${SITE}/community/p/${escapeXml(r.id)}</loc>` +
        (lastmod ? `<lastmod>${lastmod}</lastmod>` : "") +
        `<changefreq>weekly</changefreq><priority>0.7</priority></url>`
      );
    }),
  ].join("\n");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=600",
    },
  });
};
