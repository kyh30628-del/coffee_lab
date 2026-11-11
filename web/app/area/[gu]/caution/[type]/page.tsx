import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Curated from "../../../Curated";
import { getRegions, getRegionCautionCafes, getRegionCautionGradeBreakdown, getRegionCautionCounts, getRegionTasteCounts, areaAliases, TASTES, SITE, josa } from "@/lib/seoData";
import { cautionBySlug, CAUTION_PAGES, CAUTION_MIN_CAFES } from "@/lib/cautionPages";
import { isReadableQuote } from "@/lib/cafeDetailView";

// ⚠️ 주의점 집계 페이지(2026-11-10, AI·검색 노출 대책 #2) — "○○구 주차 어려운 카페".
//   광고는 단점을 말하지 않는다. 후기 2건 이상에서 확인된 주의점을 근거 후기와 함께 모은 건 우리 데이터뿐이다.
//   시설축(f/[facet])과 같은 비용 규약: 사전생성 0 · ISR 30일 · 카운트는 저장된 값을 읽는다(집계는 하루 1회 크론).
export const revalidate = 2592000;
export async function generateStaticParams() { return []; }

type Props = { params: Promise<{ gu: string; type: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gu, type } = await params;
  const area = decodeURIComponent(gu);
  const c = cautionBySlug(type);
  if (!c) return { title: "동네 커피 노트" };
  const counts = await getRegionCautionCounts();
  const total = counts[`${area}|${c.label}`] ?? 0;
  const areaShort = areaAliases(area)[0];
  const title = `${area} ${c.title} 카페 ${total}곳 — 가기 전에 알아둘 점 | 동네 커피 노트`;
  const desc = `${areaShort ? `${areaShort}·` : ""}${area}에서 ${c.aliases.slice(0, 2).join(", ")}${josa(c.aliases[Math.min(1, c.aliases.length - 1)] ?? "", "을/를")} 찾는다면. ${c.desc} 카페 ${total}곳을 서로 다른 방문 후기 2건 이상에서 확인한 곳만 모았고, 광고·협찬 글은 제외했습니다.`;
  const url = `${SITE}/area/${encodeURIComponent(area)}/caution/${type}`;
  return { title, description: desc, alternates: { canonical: url },
    openGraph: { title, description: desc, url, siteName: "동네 커피 노트", type: "website", locale: "ko_KR" } };
}

export default async function RegionCautionPage({ params }: Props) {
  const { gu, type } = await params;
  const area = decodeURIComponent(gu);
  const c = cautionBySlug(type);
  if (!c) notFound();
  const [counts, tasteCounts0] = await Promise.all([getRegionCautionCounts(), getRegionTasteCounts()]);
  const total = counts[`${area}|${c.label}`] ?? 0;
  // 근거가 너무 적으면 페이지를 열지 않는다(사이트맵 기준과 동일). 저장된 카운트가 곧 게이트라 DB 추가 조회 없이 404.
  if (total < CAUTION_MIN_CAFES) notFound();
  const [cafes0, regions, grades] = await Promise.all([
    getRegionCautionCafes(area, c.label, 30), getRegions(), getRegionCautionGradeBreakdown(area, c.label),
  ]);
  // 근거 문장은 읽히는 것만 싣는다 — 저장된 인용에는 블로그 머리말·링크 조각이 섞여 있다(실측: 마포구 주차 3곳 중 2곳).
  //   읽히지 않으면 문장 없이 카드만 보인다(카드의 주의점 칩은 그대로).
  const cafes = cafes0.map((x) => ({ ...x, quote: isReadableQuote((x as any).quote, x.name) ? (x as any).quote : null }));
  const tasteCounts: Record<string, number> = {};
  for (const t of TASTES) tasteCounts[t.key] = tasteCounts0[`${area}|${t.key}`] ?? 0;
  const sameNearby = Object.entries(counts)
    .filter(([k, v]) => k.endsWith(`|${c.label}`) && v >= CAUTION_MIN_CAFES && !k.startsWith(`${area}|`))
    .map(([k, v]) => ({ area: k.split("|")[0], n: v }))
    .sort((a, b) => b.n - a.n).slice(0, 12);
  const shownN = Math.min(total, 30);
  const heading = `${area} ${c.title} 카페 ${total}곳`;
  const areaBare = areaAliases(area)[0] || area;
  // 답이 먼저 — AI·검색이 이 한 문단만 가져가도 질문에 답이 되도록 쓴다.
  const intro = `${areaBare} ${c.aliases[0]}가 궁금하다면: ${area}에는 ${c.desc} 카페가 ${total}곳 있습니다. 서로 다른 방문 후기 2건 이상에서 같은 점이 확인된 곳만 모았어요(위 ${shownN}곳 표시, 읽을 수 있는 후기 문장은 근거로 함께). 다른 카페 광고는 단점을 말하지 않지만, 여기는 가기 전에 알아야 할 점을 먼저 보여드립니다.`;
  return <Curated area={area} tasteLabel={c.title} tasteEmoji={c.emoji} heading={heading} intro={intro}
    cafes={cafes} regions={regions} grades={grades} tasteCounts={tasteCounts} sameTasteNearby={sameNearby}
    canonical={`${SITE}/area/${encodeURIComponent(area)}/caution/${type}`} facetSlug={`caution-${type}`}
    cautionCounts={Object.fromEntries(CAUTION_PAGES.map((x) => [x.slug, counts[`${area}|${x.label}`] ?? 0]))} />;
}
