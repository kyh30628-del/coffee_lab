import { getRegionTasteCafes, tasteByKey, OG_HINT } from "@/lib/seoData";
import { ogCard, OG_SIZE } from "@/lib/ogCard";

export const runtime = "nodejs";
// 🌙 2026-09-02 — OG 이미지가 페이지 본체보다 자주 재생성되고 있었다(6h vs 48h, 8배).
//   내용은 본문보다 덜 변하는데 주기가 거꾸로였다. 본체와 같은 주기로 맞춘다.
export const revalidate = 259200;
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
