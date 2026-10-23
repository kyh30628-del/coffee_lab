import { getRegionFacetCafes, getRegionFacetCount, areaAliases, OG_HINT } from "@/lib/seoData";
import { facetBySlug } from "@/lib/facetPages";
import { ogCard, OG_SIZE } from "@/lib/ogCard";

// 🅿️ 구+시설 OG 카드(2026-10-23) — CEO 지시("유입 최대화할 매력적인 콘텐츠").
//   실측: 구+시설 페이지가 페이지당 7.2 PV로 **전 유형 중 가장 효율이 좋은데**(카페상세의 4.8배,
//   구+취향의 1.2배) 정작 OG 이미지가 하나도 없었다 — 구+취향(app/area/[gu]/[taste]/opengraph-image.tsx)엔
//   있는 걸 가장 센 유형에만 빠뜨렸다. OG 없이 공유하면 카카오톡·인스타에 미리보기가 안 뜨거나 기본
//   이미지로 나가 클릭률이 깎인다 — 제일 잘 되는 페이지가 제일 안 퍼지는 역설이었다.
//   ISR 30일 — 본체(app/area/[gu]/f/[facet]/page.tsx, revalidate=2592000)와 같은 주기로 맞춘다(짝 규칙).
export const runtime = "nodejs";
export const revalidate = 2592000;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "동네×시설 검증 카페 — 동네 커피 노트";

export default async function Image({ params }: { params: Promise<{ gu: string; facet: string }> }) {
  const { gu, facet } = await params;
  const area = decodeURIComponent(gu);
  const f = facetBySlug(facet);
  if (!f) return ogCard({ title: `${area} 카페`, footer: OG_HINT });
  const [cafes, total] = await Promise.all([getRegionFacetCafes(area, f.label, 3), getRegionFacetCount(area, f.label)]);
  const names = cafes.map((c) => c.name).join(" · ");
  const areaShort = areaAliases(area)[0] ?? area;
  return ogCard({
    title: `${areaShort} ${f.title} 카페`,
    subtitle: names || `${f.desc} 검증 카페`,
    badge: f.emoji,
    traits: total ? [`검증 ${Math.min(total, 30)}곳`] : [],
    footer: OG_HINT,
  });
}
