import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Curated from "../../Curated";
import { getRegions, getRegionTasteCafes, getRegionTasteCount, getRegionTasteGradeBreakdown, TASTES, tasteByKey, SITE, TASTE_MIN_HITS, TASTE_MIN_RATE_PCT } from "@/lib/seoData";

export const revalidate = 1800; // 30분 — 비공개/신규 반영 빠르게(이전 1일)

export async function generateStaticParams() {
  const regions = await getRegions();
  // 상위 30개 지역 × 6취향만 미리 빌드, 나머지는 ISR 온디맨드
  const top = regions.slice(0, 30);
  return top.flatMap((r) => TASTES.map((t) => ({ gu: r.area, taste: t.key })));
}

type Props = { params: Promise<{ gu: string; taste: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gu, taste } = await params;
  const area = decodeURIComponent(gu);
  const t = tasteByKey(taste);
  if (!t) return { title: "동네 커피 노트" };
  const cafes = await getRegionTasteCafes(area, taste, 5);
  const names = cafes.map((c) => c.name).slice(0, 3).join(", ");
  const title = `${area} ${t.label} 카페 — 검증된 추천 | 동네 커피 노트`;
  const desc = `${area}에서 ${t.desc} 카페를 영수증 리뷰·광고 없이 진짜 후기로 검증해 골랐어요.${names ? ` ${names} 등.` : ""}`;
  const url = `${SITE}/area/${encodeURIComponent(area)}/${taste}`;
  return {
    title, description: desc,
    alternates: { canonical: url },
    openGraph: { title, description: desc, url, siteName: "동네 커피 노트", type: "website", locale: "ko_KR" },
  };
}

export default async function RegionTastePage({ params }: Props) {
  const { gu, taste } = await params;
  const area = decodeURIComponent(gu);
  const t = tasteByKey(taste);
  if (!t) notFound();
  const [cafes, regions, total, grades] = await Promise.all([getRegionTasteCafes(area, taste, 30), getRegions(), getRegionTasteCount(area, taste), getRegionTasteGradeBreakdown(area, taste)]);
  const heading = `${area} ${t.label} 카페`;
  // 카피는 실제 채택 기준과 정확히 일치해야 한다(예전엔 '언급 1회'도 포함해 놓고 "N곳 검증"이라 적었다).
  const intro = `${area}에서 ${t.desc} 카페 ${total || cafes.length}곳. 후기에 ${t.short} 이야기가 ${TASTE_MIN_HITS}건 이상, 그 카페 전체 후기의 ${TASTE_MIN_RATE_PCT}% 이상 나온 곳만 골랐어요.`;
  return <Curated area={area} tasteKey={taste} tasteLabel={t.short} tasteEmoji={t.emoji} heading={heading} intro={intro} cafes={cafes} regions={regions} grades={grades} canonical={`${SITE}/area/${encodeURIComponent(area)}/${taste}`} />;
}
