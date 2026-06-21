import { getRegionCafes, OG_HINT } from "@/lib/seoData";
import { ogCard, OG_SIZE } from "@/lib/ogCard";

export const runtime = "nodejs";
export const revalidate = 86400;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "동네별 검증 카페 — 동네 커피 노트";

export default async function Image({ params }: { params: Promise<{ gu: string }> }) {
  const { gu } = await params;
  const area = decodeURIComponent(gu);
  const cafes = await getRegionCafes(area, 3);
  const names = cafes.map((c) => c.name).join(" · ");
  return ogCard({ title: `${area} 카페 추천`, subtitle: names || "진짜 후기로 검증한 동네 카페", badge: "검증", footer: OG_HINT });
}
