import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Curated from "../../../Curated";
import { getRegions, getRegionFacetCafes, getRegionFacetCount, getRegionFacetCounts, getRegionFacetGradeBreakdown, getRegionTasteCounts, areaAliases, TASTES, SITE, josa } from "@/lib/seoData";
import { facetBySlug, FACET_PAGES, FACET_MIN_CAFES } from "@/lib/facetPages";

export const revalidate = 2592000; // ISR 30일 — 기존 지역×취향과 같은 규약.

// 💰 빌드 사전생성 0 — 동 페이지에서 검증된 패턴(그때 빌드 -18.7초·-35%).
//   사이트맵에 전부 실려 있어 크롤러 첫 요청 때 그 1건만 만들어지고 30일 캐시된다.
export async function generateStaticParams() { return []; }

type Props = { params: Promise<{ gu: string; facet: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gu, facet } = await params;
  const area = decodeURIComponent(gu);
  const f = facetBySlug(facet);
  if (!f) return { title: "동네 커피 노트" };
  const [cafes, total] = await Promise.all([getRegionFacetCafes(area, f.label, 5), getRegionFacetCount(area, f.label)]);
  const names = cafes.map((c) => c.name).slice(0, 3).join(", ");
  const areaShort = areaAliases(area)[0];
  const shownN = Math.min(total || cafes.length, 30);
  const bestN = shownN >= 5 ? ` BEST ${shownN}` : "";
  // 제목은 사람들이 실제로 치는 말 그대로 — "{지역} {시설} 카페". 경쟁사가 1위인 자리가 정확히 이 형태다.
  const title = `${area} ${f.title} 카페${bestN} — ${areaShort ? `${areaShort} ` : ""}${f.aliases[0]} 검증 추천 | 동네 커피 노트`;
  const desc = `${areaShort ? `${areaShort}·` : ""}${area}에서 ${f.aliases.slice(0, 2).join(", ")}${josa(f.aliases[Math.min(1, f.aliases.length - 1)] ?? "", "을/를")} 찾는다면. ${f.desc} 카페 ${total}곳을 영수증 리뷰·광고 없이 진짜 후기로 검증해 골랐어요.${names ? ` ${names} 등.` : ""}`;
  const url = `${SITE}/area/${encodeURIComponent(area)}/f/${facet}`;
  return { title, description: desc, alternates: { canonical: url },
    openGraph: { title, description: desc, url, siteName: "동네 커피 노트", type: "website", locale: "ko_KR" } };
}

export default async function RegionFacetPage({ params }: Props) {
  const { gu, facet } = await params;
  const area = decodeURIComponent(gu);
  const f = facetBySlug(facet);
  if (!f) notFound();
  const [cafes, regions, total, grades, allCounts, allTasteCounts] = await Promise.all([
    getRegionFacetCafes(area, f.label, 30), getRegions(), getRegionFacetCount(area, f.label),
    getRegionFacetGradeBreakdown(area, f.label), getRegionFacetCounts(), getRegionTasteCounts(),
  ]);
  //   🔗 2026-09-14: 시설축 페이지에서 취향 페이지로 가는 링크가 막혀 있었다(tasteCounts를 빈 객체로 넘겼다).
  //     막다른 페이지는 사람도 크롤러도 되돌아 나간다. 6시간 캐시된 값이라 추가 조회 비용 0.
  const tasteCounts: Record<string, number> = {};
  for (const t of TASTES) tasteCounts[t.key] = allTasteCounts[`${area}|${t.key}`] ?? 0;
  // 근거가 너무 적으면 페이지를 열지 않는다 — 3곳짜리 목록에 "BEST"라 쓸 수 없다(사이트맵 기준과 동일).
  if (total < FACET_MIN_CAFES) notFound();
  const facetCounts: Record<string, number> = {};
  for (const x of FACET_PAGES) facetCounts[x.slug] = allCounts[`${area}|${x.label}`] ?? 0;
  const sameNearby = Object.entries(allCounts)
    .filter(([k, v]) => k.endsWith(`|${f.label}`) && v >= FACET_MIN_CAFES && !k.startsWith(`${area}|`))
    .map(([k, v]) => ({ area: k.split("|")[0], n: v }))
    .sort((a, b) => b.n - a.n).slice(0, 12);
  const shownN = Math.min(total || cafes.length, 30);
  const heading = `${area} ${f.title} 카페${shownN >= 5 ? ` BEST ${shownN}` : ""}`;
  const areaBare = areaAliases(area)[0] || area;
  const intro = `${areaBare} ${f.aliases.slice(0, 2).join("·")} 찾으시나요? ${area}에서 ${f.desc} 카페 ${total}곳. 서로 다른 후기 2건 이상에서 확인된 곳만 골랐어요.`;
  return <Curated area={area} tasteLabel={f.title} tasteEmoji={f.emoji} heading={heading} intro={intro}
    cafes={cafes} regions={regions} grades={grades} tasteCounts={tasteCounts} sameTasteNearby={sameNearby}
    canonical={`${SITE}/area/${encodeURIComponent(area)}/f/${facet}`} facetSlug={facet} facetCounts={facetCounts} />;
}
