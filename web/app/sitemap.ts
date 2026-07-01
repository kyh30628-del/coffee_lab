import type { MetadataRoute } from "next";
import { sql } from "@/lib/db";
import { getRegions, TASTES } from "@/lib/seoData";

export const runtime = "nodejs";
export const revalidate = 3600; // 감사수리: 결재 집행(공개/비공개) 반영 지연 축소 — 페이지(3600)와 짝 맞춤

const SITE = "https://dongnecoffeenote.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let cafes: { id: number }[] = [];
  try {
    cafes = (await sql`SELECT id FROM cafes WHERE published = true ORDER BY synth_count DESC NULLS LAST LIMIT 5000`) as unknown as { id: number }[];
  } catch { /* DB 불가 시 기본 페이지만 */ }
  const cafeUrls: MetadataRoute.Sitemap = cafes.map((c) => ({
    url: `${SITE}/c/${c.id}`, changeFrequency: "weekly", priority: 0.7,
  }));
  const tasteUrls: MetadataRoute.Sitemap = ["roast", "work", "quiet", "dessert"].map((t) => ({
    url: `${SITE}/taste/${t}`, changeFrequency: "monthly", priority: 0.6,
  }));
  // 프로그래매틱 SEO: 동네별 + 동네×취향
  const regions = await getRegions();
  const regionUrls: MetadataRoute.Sitemap = regions.map((r) => ({
    url: `${SITE}/area/${encodeURIComponent(r.area)}`, changeFrequency: "weekly", priority: 0.8,
  }));
  const regionTasteUrls: MetadataRoute.Sitemap = regions.flatMap((r) =>
    TASTES.map((t) => ({ url: `${SITE}/area/${encodeURIComponent(r.area)}/${t.key}`, changeFrequency: "weekly" as const, priority: 0.6 }))
  );
  return [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/area`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/pricing`, changeFrequency: "monthly", priority: 0.5 },
    ...tasteUrls,
    ...regionUrls,
    ...regionTasteUrls,
    ...cafeUrls,
  ];
}
