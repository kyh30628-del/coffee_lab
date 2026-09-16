import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Curated from "../../../../../Curated";
import { getDongFacetCafes, getDongFacetCounts, SITE, josa } from "@/lib/seoData";
import { facetBySlug, FACET_PAGES, FACET_MIN_CAFES } from "@/lib/facetPages";

export const revalidate = 2592000; // ISR 30일 — 기존 SEO 페이지와 같은 규약.
export async function generateStaticParams() { return []; }   // 💰 빌드 사전생성 0

type Props = { params: Promise<{ gu: string; dong: string; facet: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gu, dong, facet } = await params;
  const area = decodeURIComponent(gu), d = decodeURIComponent(dong);
  const f = facetBySlug(facet);
  if (!f) return { title: "동네 커피 노트" };
  const [cafes, counts] = await Promise.all([getDongFacetCafes(area, d, f.label, 30), getDongFacetCounts()]);
  const total = counts[`${area}|${d}|${f.label}`] ?? cafes.length;
  const names = cafes.map((c) => c.name).slice(0, 3).join(", ");
  const bestN = total >= 5 ? ` BEST ${total}` : "";
  // 🔑 제목 단위가 **동네명**이다 — 경쟁사가 1위인 자리가 정확히 이 형태다("목동 주차 가능한 카페").
  const title = `${d} ${f.title} 카페${bestN} — ${d} ${f.aliases[0]} 검증 추천 | 동네 커피 노트`;
  const a2 = f.aliases.slice(0, 2);
  const desc = `${area} ${d}에서 ${a2.join(", ")}${josa(a2[a2.length - 1] ?? "", "을/를")} 찾는다면. ${f.desc} 카페 ${total}곳을 영수증 리뷰·광고 없이 실제 방문 후기로 검증해 골랐어요.${names ? ` ${names} 등.` : ""}`;
  const url = `${SITE}/area/${encodeURIComponent(area)}/dong/${encodeURIComponent(d)}/f/${facet}`;
  return { title, description: desc, alternates: { canonical: url },
    openGraph: { title, description: desc, url, siteName: "동네 커피 노트", type: "website", locale: "ko_KR" } };
}

export default async function DongFacetPage({ params }: Props) {
  const { gu, dong, facet } = await params;
  const area = decodeURIComponent(gu), d = decodeURIComponent(dong);
  const f = facetBySlug(facet);
  if (!f) notFound();
  const [cafes, allCounts] = await Promise.all([getDongFacetCafes(area, d, f.label, 30), getDongFacetCounts()]);
  const total = allCounts[`${area}|${d}|${f.label}`] ?? cafes.length;
  if (total < FACET_MIN_CAFES) notFound();   // 얇은 콘텐츠를 스스로 제출하지 않는다
  const facetCounts: Record<string, number> = {};
  for (const x of FACET_PAGES) facetCounts[x.slug] = allCounts[`${area}|${d}|${x.label}`] ?? 0;
  const sameNearby = Object.entries(allCounts)
    .filter(([k, v]) => k.endsWith(`|${f.label}`) && v >= FACET_MIN_CAFES && !k.startsWith(`${area}|${d}|`))
    .map(([k, v]) => ({ area: k.split("|")[1], n: v }))
    .sort((a, b) => b.n - a.n).slice(0, 12);
  const heading = `${d} ${f.title} 카페${total >= 5 ? ` BEST ${total}` : ""}`;
  const intro = `${d} ${f.aliases.slice(0, 2).join("·")} 찾으시나요? ${area} ${d}에서 ${f.desc} 카페 ${total}곳. 서로 다른 후기 2건 이상에서 확인된 곳만 골랐어요.`;
  return <Curated area={area} tasteLabel={f.title} tasteEmoji={f.emoji} heading={heading} intro={intro}
    cafes={cafes} sameTasteNearby={sameNearby}
    backHref={`/area/${encodeURIComponent(area)}/dong/${encodeURIComponent(d)}`} backLabel={`${d} 전체`}
    showTasteNav={false} facetSlug={facet} facetCounts={facetCounts}
    canonical={`${SITE}/area/${encodeURIComponent(area)}/dong/${encodeURIComponent(d)}/f/${facet}`} />;
}
