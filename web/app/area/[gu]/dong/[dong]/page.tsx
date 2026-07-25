import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Curated from "../../../Curated";
import { getDongs, getDongsInArea, getDongCafes, getDongPublishedCount, SITE } from "@/lib/seoData";

export const revalidate = 1800; // 30분 — 비공개/신규 반영 빠르게(구·취향 페이지와 동일 정책)

export async function generateStaticParams() {
  const dongs = await getDongs();
  // 빌드 비용 제어 — 상위 150곳만 미리 빌드, 나머지는 온디맨드 ISR(구·취향 페이지의 "top 30" 정책과 동일 원칙).
  // sitemap엔 631곳 전부 실려 크롤러가 요청하는 즉시 생성·캐시되므로 "전체 확장"은 그대로 유지된다.
  return dongs.slice(0, 150).map((d) => ({ gu: d.area, dong: d.dong }));
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
