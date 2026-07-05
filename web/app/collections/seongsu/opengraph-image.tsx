import { OG_HINT } from "@/lib/seoData";
import { ogCard, OG_SIZE } from "@/lib/ogCard";

export const runtime = "nodejs";
export const revalidate = 86400;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "성수동 카페 추천 — 협찬 없이 진짜 후기로 교차검증 — 동네 커피 노트";

export default async function Image() {
  return ogCard({ title: "성수동 카페 추천", subtitle: "광고·협찬·타지점 후기 빼고 진짜 후기로 교차검증", badge: "검증", footer: OG_HINT });
}
