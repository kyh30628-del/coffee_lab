import { getRegionTasteCafes, tasteByKey, OG_HINT } from "@/lib/seoData";
import { ogCard, OG_SIZE } from "@/lib/ogCard";

export const runtime = "nodejs";
export const revalidate = 86400;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "동네×취향 검증 카페 — 동네 커피 노트";

export default async function Image({ params }: { params: Promise<{ gu: string; taste: string }> }) {
  const { gu, taste } = await params;
  const area = decodeURIComponent(gu);
  const t = tasteByKey(taste);
  if (!t) return ogCard({ title: `${area} 카페`, footer: OG_HINT });
  const cafes = await getRegionTasteCafes(area, taste, 3);
  const names = cafes.map((c) => c.name).join(" · ");
  return ogCard({ title: `${area} ${t.label} 카페`, subtitle: names || `${t.desc} 검증 카페`, badge: `${t.emoji} ${t.short}`, footer: OG_HINT });
}
