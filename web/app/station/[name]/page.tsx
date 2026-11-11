import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Curated from "../../area/Curated";
import { getRegions, getStationCafes, getStationCounts, getAreaCautionCounts, SITE } from "@/lib/seoData";
import { resolveStation, nearbyStations, STATION_MIN_CAFES, STATION_RADIUS_M } from "@/lib/stations";

// 🚇 역 단위 카페 페이지(2026-11-10, 유입 확대) — "{역 이름} 카페"는 한국 지역 검색의 대표 패턴이다.
//   우리는 구·동·취향·시설 페이지만 있고 역 페이지는 0이었다. 반경 600m(도보 약 8분) 안 공개 카페를 검증 우선으로 보여준다.
//   비용 규약은 시설축 페이지와 같다: 사전생성 0 · ISR 30일 · 카운트는 저장된 값(seo_counts)을 읽는다(집계는 하루 1회 크론).
export const revalidate = 2592000;
export async function generateStaticParams() { return []; }

type Props = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name: raw } = await params;
  const st = resolveStation(raw);
  if (!st) return { title: "동네 커피 노트" };
  const counts = await getStationCounts();
  const total = counts[st] ?? 0;
  const cafes = total >= STATION_MIN_CAFES ? await getStationCafes(st, 3) : [];
  const names = cafes.map((c) => c.name).slice(0, 3).join(", ");
  const title = `${st}역 카페 ${total}곳 — 도보 8분 이내 검증 후기 | 동네 커피 노트`;
  const desc = `${st}역 근처 카페를 찾는다면. 역에서 ${STATION_RADIUS_M}m(도보 약 8분) 안의 카페 ${total}곳을 광고·협찬 글을 걸러낸 실제 방문 후기로 검증해 골랐어요.${names ? ` ${names} 등.` : ""}`.slice(0, 158);
  const url = `${SITE}/station/${encodeURIComponent(st + "역")}`;
  return { title, description: desc, alternates: { canonical: url },
    openGraph: { title, description: desc, url, siteName: "동네 커피 노트", type: "website", locale: "ko_KR" } };
}

export default async function StationPage({ params }: Props) {
  const { name: raw } = await params;
  const st = resolveStation(raw);
  if (!st) notFound();
  const counts = await getStationCounts();
  const total = counts[st] ?? 0;
  if (total < STATION_MIN_CAFES) notFound();
  const [cafes, regions] = await Promise.all([getStationCafes(st, 30), getRegions()]);
  if (!cafes.length) notFound();
  // 이 역이 속한 지역 = 목록에서 가장 많이 나온 area(링크·빵부스러기용)
  const tally = new Map<string, number>();
  for (const c of cafes) { const a = (c as any).area as string | undefined; if (a) tally.set(a, (tally.get(a) ?? 0) + 1); }
  const area = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const cautionCounts = area ? await getAreaCautionCounts(area).catch(() => ({} as Record<string, number>)) : undefined;
  const verified = cafes.filter((c) => c.grade === "검증").length;
  const shownN = Math.min(total, 30);
  const heading = `${st}역 카페 ${total}곳`;
  const intro = `${st}역 근처 카페가 궁금하다면: 역에서 ${STATION_RADIUS_M}m(도보 약 8분) 안에 공개된 카페는 ${total}곳이고, 그중 후기 근거가 충분한 '검증' 등급이 ${verified}곳이에요(위 ${shownN}곳 표시). 광고·협찬 글을 걸러낸 실제 방문 후기로 골랐고, 가기 전에 알아둘 점도 함께 보여드려요.`;
  const crossLinks = nearbyStations(st, 3, 12).filter((n) => (counts[n.name] ?? 0) >= STATION_MIN_CAFES)
    .map((n) => ({ label: `${n.name}역 카페 ${counts[n.name]}곳`, href: `/station/${encodeURIComponent(n.name + "역")}` }));
  return <Curated area={area} tasteLabel={`${st}역`} tasteEmoji="🚇" heading={heading} intro={intro}
    cafes={cafes} regions={regions} cautionCounts={cautionCounts}
    canonical={`${SITE}/station/${encodeURIComponent(st + "역")}`} facetSlug={`station-${st}`}
    crossLinks={crossLinks} crossLinksLabel="주변 역 카페도 둘러보기" />;
}
