import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Curated from "../../../Curated";
import { getDongsInArea, getDongCafes, getDongPublishedCount, SITE } from "@/lib/seoData";

export const revalidate = 86400; // ISR 24시간

// 빌드 비용 제로화(2026-07-26, CEO 지시) — 빌드타임 프리렌더 0곳. 전부 온디맨드 ISR.
// sitemap엔 631곳 전부 실려 있어 크롤러 첫 요청 시 그 1건만 생성·캐시(revalidate 30분)되고,
// 배포마다 반복되던 "150곳 미리 빌드" 비용(+18.7초/+35% 빌드시간, 실측)이 완전히 사라진다.
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ gu: string; dong: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gu, dong } = await params;
  const area = decodeURIComponent(gu);
  const d = decodeURIComponent(dong);
  const cafes = await getDongCafes(area, d, 5);
  const names = cafes.map((c) => c.name).slice(0, 3).join(", ");
  const title = `${d} 카페 추천 — 진짜 후기로 검증한 곳 | 동네 커피 노트`;
  const desc = `${area} ${d}에서 가볼 만한 카페를 영수증 리뷰·광고 없이 네이버·구글·유튜브 공개 후기로 검증해 골랐어요.${names ? ` ${names} 등.` : ""}`;
  const url = `${SITE}/area/${encodeURIComponent(area)}/dong/${encodeURIComponent(d)}`;
  return {
    title, description: desc,
    alternates: { canonical: url },
    openGraph: { title, description: desc, url, siteName: "동네 커피 노트", type: "website", locale: "ko_KR" },
  };
}

export default async function DongPage({ params }: Props) {
  const { gu, dong } = await params;
  const area = decodeURIComponent(gu);
  const d = decodeURIComponent(dong);
  const [cafes, siblings, total] = await Promise.all([getDongCafes(area, d, 30), getDongsInArea(area), getDongPublishedCount(area, d)]);
  if (!cafes.length && !total) notFound();
  const heading = `${d} 카페 추천`;
  const intro = `${area} ${d}에서 가볼 만한 동네 카페 ${total || cafes.length}곳을 진짜 후기로 검증해 모았어요.`;
  const crossLinks = siblings.filter((s) => s.dong !== d).slice(0, 24).map((s) => ({ label: s.dong, href: `/area/${encodeURIComponent(area)}/dong/${encodeURIComponent(s.dong)}` }));
  return (
    <Curated
      area={area}
      heading={heading}
      intro={intro}
      cafes={cafes}
      canonical={`${SITE}/area/${encodeURIComponent(area)}/dong/${encodeURIComponent(d)}`}
      backHref={`/area/${encodeURIComponent(area)}`}
      backLabel={`${area} 전체`}
      showTasteNav={false}
      crossLinks={crossLinks}
      crossLinksLabel={`${area}의 다른 동네도 둘러보기`}
    />
  );
}
