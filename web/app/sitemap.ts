import type { MetadataRoute } from "next";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 86400; // 하루

const SITE = "https://dongnecoffeenote.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let cafes: { id: number }[] = [];
  try {
    cafes = (await sql`SELECT id FROM cafes WHERE published = true ORDER BY synth_count DESC NULLS LAST LIMIT 5000`) as unknown as { id: number }[];
  } catch { /* DB 불가 시 기본 페이지만 */ }
  const cafeUrls: MetadataRoute.Sitemap = cafes.map((c) => ({
    url: `${SITE}/c/${c.id}`, changeFrequency: "weekly", priority: 0.7,
  }));
  return [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/pricing`, changeFrequency: "monthly", priority: 0.5 },
    ...cafeUrls,
  ];
}
