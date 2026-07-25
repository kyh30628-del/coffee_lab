import type { Metadata } from "next";
import Link from "next/link";
import Curated from "../Curated";
import { getRegions, getRegionCafes, getDongsInArea, SITE } from "@/lib/seoData";
import { regionPublishedCount } from "@/lib/region";

export const revalidate = 1800; // 30분 — 비공개/신규 반영 빠르게(이전 1일)

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
  const title = `${area} 카페 추천 — 진짜 후기로 검증한 곳 | 동네 커피 노트`;
  const desc = `${area}에서 가볼 만한 카페를 영수증 리뷰·광고 없이 네이버·구글·유튜브 공개 후기로 검증해 골랐어요.${names ? ` ${names} 등.` : ""}`;
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
  const [cafes, regions, total, dongs] = await Promise.all([getRegionCafes(area, 30), getRegions(), regionPublishedCount(area), getDongsInArea(area)]);
  const heading = `${area} 카페 추천`;
  const intro = `${area}에서 가볼 만한 동네 카페 ${total || cafes.length}곳을 진짜 후기로 검증해 모았어요. 취향별로도 골라보세요.`;
  const extra = dongs.length > 0 ? (
    <div className="mt-8 pt-5 border-t border-[#e6dcc8]">
      <div className="text-[12px] font-bold text-[#7a5122] mb-2">동별로 보기</div>
      <div className="flex flex-wrap gap-1.5">
        {dongs.map((d) => (
          <Link key={d.dong} href={`/area/${encodeURIComponent(area)}/dong/${encodeURIComponent(d.dong)}`} className="text-[12px] px-2.5 py-1 rounded-full bg-white text-[#524234] border border-[#d9c9b0]">{d.dong}</Link>
        ))}
      </div>
    </div>
  ) : undefined;
  return <Curated area={area} heading={heading} intro={intro} cafes={cafes} regions={regions} canonical={`${SITE}/area/${encodeURIComponent(area)}`} extra={extra} />;
}
