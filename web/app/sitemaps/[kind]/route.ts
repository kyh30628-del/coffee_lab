import { sitemapByKind, type SitemapKind } from "@/app/sitemap";

// 📑 유형별 사이트맵(2026-09-15) — /sitemaps/cafes.xml · /sitemaps/facet.xml …
//   Search Console에 이것들을 따로 제출하면 **유형별 색인 수**를 볼 수 있다.
//   ⚠️ /sitemap.xml(전체)은 그대로 살아 있다 — IndexNow가 그 주소를 읽는다. 여기는 관측용 추가분이다.
export const revalidate = 21600;
const KINDS = ["cafes", "areas", "taste", "facet", "dong", "dongtaste", "dongfacet", "misc"];

export async function generateStaticParams() { return KINDS.map((kind) => ({ kind: `${kind}.xml` })); }

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const k = kind.replace(/\.xml$/, "");
  if (!KINDS.includes(k)) return new Response("not found", { status: 404 });
  const rows = await sitemapByKind(k as SitemapKind);
  const esc = (u: string) => u.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    rows.map((r) => `  <url><loc>${esc(String(r.url))}</loc>${r.lastModified ? `<lastmod>${new Date(r.lastModified as any).toISOString().slice(0, 10)}</lastmod>` : ""}${r.changeFrequency ? `<changefreq>${r.changeFrequency}</changefreq>` : ""}${r.priority != null ? `<priority>${r.priority}</priority>` : ""}</url>`).join("\n")
  }\n</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400" } });
}
