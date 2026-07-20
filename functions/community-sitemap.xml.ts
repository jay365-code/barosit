// Cloudflare Pages Function — 동적 커뮤니티 사이트맵(/community-sitemap.xml).
// UGC 라 빌드타임 정적 사이트맵 불가 → 요청 시 글 목록을 조회해 permalink urlset 생성.
// robots.txt 에 이 사이트맵을 등록해 크롤러가 전체 글을 발견하도록 한다.
import { Env, SITE, supabaseCreds, escapeXml } from "./_shared/ssr";

interface Row {
  id: string;
  created_at: string;
  language: string | null;
  translation_group_id: string | null;
}

// 검증자(ETag/Last-Modified) — 크롤러가 조건부 요청으로 재확인할 수 있어야 재방문 우선순위가 유지된다.
// 글 수 + 최신 글 시각이면 본문 변경을 충분히 대변하므로 전체 해시 대신 약한 검증자를 쓴다.
function validators(rows: Row[]): { etag: string; lastModified: string | null } {
  const newest = rows[0]?.created_at || "";
  const ts = newest ? Date.parse(newest) : NaN;
  return {
    etag: `W/"${rows.length}-${Number.isNaN(ts) ? 0 : ts}"`,
    lastModified: Number.isNaN(ts) ? null : new Date(ts).toUTCString(),
  };
}

function headers(etag: string, lastModified: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "content-type": "application/xml; charset=utf-8",
    "cache-control": "public, max-age=0, s-maxage=600",
    etag,
  };
  if (lastModified) h["last-modified"] = lastModified;
  return h;
}

// 핸들러에서 실제로 쓰는 것만 명시 — 이 repo 는 functions/ 를 tsc 대상에 넣지 않아
// PagesFunction 의 정확한 시그니처에 기대지 않는 편이 안전하다.
async function build(context: { env: Env; request: Request }) {
  const { env } = context;
  const { base, key } = supabaseCreds(env);
  const url = `${base}/rest/v1/posts?select=id,created_at,language,translation_group_id&order=created_at.desc&limit=5000`;

  let rows: Row[] = [];
  try {
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (res.ok) rows = (await res.json()) as Row[];
  } catch {
    rows = [];
  }

  // 번역그룹별 형제 모음 → 각 글 url 에 hreflang 대체 링크(xhtml:link) 삽입.
  const byGroup = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.translation_group_id) continue;
    const arr = byGroup.get(r.translation_group_id);
    if (arr) arr.push(r); else byGroup.set(r.translation_group_id, [r]);
  }

  const urls = [
    `  <url><loc>${SITE}/community</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>`,
    ...rows.map((r) => {
      const lastmod = (r.created_at || "").slice(0, 10);
      const sibs = r.translation_group_id ? byGroup.get(r.translation_group_id) || [] : [];
      let alts = "";
      if (sibs.length > 1) {
        for (const s of sibs) {
          if (s.language) alts += `<xhtml:link rel="alternate" hreflang="${escapeXml(s.language)}" href="${SITE}/community/p/${escapeXml(s.id)}"/>`;
        }
        const anchor = sibs.find((s) => s.id === r.translation_group_id) || sibs[0];
        alts += `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/community/p/${escapeXml(anchor.id)}"/>`;
      }
      return (
        `  <url><loc>${SITE}/community/p/${escapeXml(r.id)}</loc>` +
        (lastmod ? `<lastmod>${lastmod}</lastmod>` : "") +
        `<changefreq>weekly</changefreq><priority>0.7</priority>${alts}</url>`
      );
    }),
  ].join("\n");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;

  return { xml, ...validators(rows) };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { xml, etag, lastModified } = await build(context);
  // 변경 없음 → 304 로 크롤 예산 절약.
  if (context.request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: headers(etag, lastModified) });
  }
  return new Response(xml, { status: 200, headers: headers(etag, lastModified) });
};

// HEAD 미구현 시 함수를 안 타고 정적 SPA 셸(text/html)로 폴백돼, HEAD 로 먼저 확인하는
// 크롤러·검증 도구에 "XML 아님"으로 보인다. GET 과 동일 헤더를 본문 없이 반환.
export const onRequestHead: PagesFunction<Env> = async (context) => {
  const { etag, lastModified } = await build(context);
  return new Response(null, { status: 200, headers: headers(etag, lastModified) });
};
