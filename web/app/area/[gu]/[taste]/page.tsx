import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Curated from "../../Curated";
import { getRegions, getRegionTasteCafes, TASTES, tasteByKey, SITE } from "@/lib/seoData";

export const revalidate = 86400;

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
  const [cafes, regions] = await Promise.all([getRegionTasteCafes(area, taste, 30), getRegions()]);
  const heading = `${area} ${t.label} 카페`;
  const intro = `${area}에서 ${t.desc} 카페 ${cafes.length}곳을 진짜 후기로 검증해 골랐어요.`;
  return <Curated area={area} tasteKey={taste} heading={heading} intro={intro} cafes={cafes} regions={regions} canonical={`${SITE}/area/${encodeURIComponent(area)}/${taste}`} />;
}
