import type { Metadata } from "next";
import Link from "next/link";
import Curated from "../Curated";
import { getRegions, getRegionCafes, getDongsInArea, getRegionTasteCounts, getRegionFacetCounts, TASTES, SITE } from "@/lib/seoData";
import { regionPublishedCount } from "@/lib/region";
import { FACET_PAGES, FACET_MIN_CAFES } from "@/lib/facetPages";

export const revalidate = 2592000; // ISR 30일 — 새벽 절전(2026-09-09). 무효화는 온디맨드.

export async function generateStaticParams() {
  const regions = await getRegions();
  return regions.map((r) => ({ gu: r.area }));
}

type Props = { params: Promise<{ gu: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gu } = await params;
  const area = decodeURIComponent(gu);
  const cafes = await getRegionCafes(area, 5);
  const names = cafes.map((c) => c.name).slice(0, 3).join(", ");
  const title = `${area} 카페 추천 — 실제 방문 후기로 검증한 곳 | 동네 커피 노트`;
  const desc = `${area}에서 가볼 만한 카페를 영수증 리뷰·광고 없이 네이버·구글·유튜브 공개 후기를 교차검증해 골랐어요.${names ? ` ${names} 등.` : ""}`;
  const url = `${SITE}/area/${encodeURIComponent(area)}`;
  return {
    title, description: desc,
    alternates: { canonical: url },
    openGraph: { title, description: desc, url, siteName: "동네 커피 노트", type: "website", locale: "ko_KR" },
  };
}

export default async function RegionPage({ params }: Props) {
  const { gu } = await params;
  const area = decodeURIComponent(gu);
  const [cafes, regions, total, dongs, regionTasteCounts, regionFacetCounts] = await Promise.all([
    getRegionCafes(area, 30), getRegions(), regionPublishedCount(area), getDongsInArea(area), getRegionTasteCounts(), getRegionFacetCounts(),
  ]);
  // 🔴 2026-11-08 발견: 구 허브 페이지가 동(洞) 목록만 링크하고 취향·시설 페이지로는 한 번도 링크한 적이
  //   없었다 — "강남구 애견동반 카페" 같은 페이지가 사이트맵엔 있어 색인은 되지만, 구 허브에서 그 페이지로
  //   가는 내부링크가 없어 구 허브의 링크 지분(authority)이 전혀 안 흘렀다(동 페이지를 한 단 더 거쳐야
  //   닿았음). 동 페이지(app/area/[gu]/dong/[dong])가 이미 쓰는 것과 같은 집계(getRegionTasteCounts·
  //   getRegionFacetCounts, 하루 1회 크론 집계 캐시라 추가 쿼리 비용 0)를 구 허브에도 그대로 적용.
  const tasteLinks = TASTES.filter((t) => (regionTasteCounts[`${area}|${t.key}`] ?? 0) >= 5)
    .map((t) => ({ label: `${t.emoji} ${area} ${t.short} ${regionTasteCounts[`${area}|${t.key}`]}`, href: `/area/${encodeURIComponent(area)}/${t.key}` }));
  const facetLinks = FACET_PAGES.filter((f) => (regionFacetCounts[`${area}|${f.label}`] ?? 0) >= FACET_MIN_CAFES)
    .map((f) => ({ label: `${f.emoji} ${area} ${f.title} ${regionFacetCounts[`${area}|${f.label}`]}`, href: `/area/${encodeURIComponent(area)}/f/${f.slug}` }));
  const siblingRegionLinks = regions.filter((r) => r.area !== area).slice(0, 24).map((r) => ({ label: r.area, href: `/area/${encodeURIComponent(r.area)}` }));
  const heading = `${area} 카페 추천`;
  const intro = `${area}에서 가볼 만한 동네 카페 ${total || cafes.length}곳을 실제 방문 후기로 검증해 모았어요. 취향별로도 골라보세요.`;
  const extra = dongs.length > 0 ? (
    <div className="mt-8 pt-5 border-t border-note-line">
      <div className="text-[9.6px] font-bold text-note-brown mb-2">동별로 보기</div>
      <div className="flex flex-wrap gap-1.5">
        {dongs.map((d) => (
          <Link key={d.dong} href={`/area/${encodeURIComponent(area)}/dong/${encodeURIComponent(d.dong)}`} className="text-[9.6px] px-2.5 py-1 rounded-full bg-white text-note-ink-body border border-[#d9c9b0]">{d.dong}</Link>
        ))}
      </div>
    </div>
  ) : undefined;
  return (
    <Curated
      area={area} heading={heading} intro={intro} cafes={cafes} regions={regions}
      canonical={`${SITE}/area/${encodeURIComponent(area)}`} extra={extra}
      crossLinks={[...tasteLinks, ...facetLinks, ...siblingRegionLinks]}
      crossLinksLabel={tasteLinks.length || facetLinks.length ? `${area} 취향·시설별로 보기 · 다른 지역도 둘러보기` : "다른 지역도 둘러보기"}
    />
  );
}
