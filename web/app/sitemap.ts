import type { MetadataRoute } from "next";
import { sql } from "@/lib/db";
import { getRegions, getDongs, getRegionTasteCounts, TASTES } from "@/lib/seoData";
import { COLLECTIONS } from "@/lib/collections";

export const runtime = "nodejs";
export const revalidate = 3600; // 감사수리: 결재 집행(공개/비공개) 반영 지연 축소 — 페이지(3600)와 짝 맞춤

const SITE = "https://dongnecoffeenote.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let cafes: { id: number; synth_updated?: string }[] = [];
  try {
    // 전량 제출(2026-08-06). 예전 LIMIT 5000은 공개 13,460곳 중 8,460곳(63%)을 검색엔진에 제출조차
    //   못 하게 막고 있었다 — 사이트맵 한도는 URL 50,000개·50MB라 전량을 넣어도 여유가 크다.
    // lastmod 추가(2026-08-13, 구글 채널 강화): 구글은 changefreq·priority를 무시하고 **lastmod로 재크롤
    //   우선순위를 정한다**. synth_updated(리뷰 재합성 시각)가 곧 콘텐츠 변경 시각 — 작은 컬럼 1개 추가라 비용 무시 수준.
    cafes = (await sql`SELECT id, synth_updated FROM cafes WHERE published = true ORDER BY synth_count DESC NULLS LAST`) as unknown as { id: number; synth_updated?: string }[];
  } catch { /* DB 불가 시 기본 페이지만 */ }
  const cafeUrls: MetadataRoute.Sitemap = cafes.map((c) => ({
    url: `${SITE}/c/${c.id}`, changeFrequency: "weekly", priority: 0.7,
    ...(c.synth_updated ? { lastModified: new Date(c.synth_updated) } : {}),
  }));
  const tasteUrls: MetadataRoute.Sitemap = ["roast", "work", "quiet", "dessert"].map((t) => ({
    url: `${SITE}/taste/${t}`, changeFrequency: "monthly", priority: 0.6,
  }));
  // 프로그래매틱 SEO: 동네별 + 동네×취향
  const regions = await getRegions();
  const regionUrls: MetadataRoute.Sitemap = regions.map((r) => ({
    url: `${SITE}/area/${encodeURIComponent(r.area)}`, changeFrequency: "weekly", priority: 0.8,
  }));
  // 지역×취향은 **채택 기준(TASTE_MIN_*)을 통과한 카페가 5곳 이상**인 조합만 제출 —
  //   기준 상향 후 몇 곳 안 남는 조합까지 넣으면 얇은 콘텐츠(thin content)를 스스로 제출하는 꼴이 된다.
  //   곳수는 쿼리 1회로 한꺼번에 받는다(지역×취향 408회 개별조회 금지).
  const tasteCounts = await getRegionTasteCounts();
  const regionTasteUrls: MetadataRoute.Sitemap = regions.flatMap((r) =>
    TASTES.filter((t) => (tasteCounts[`${r.area}|${t.key}`] ?? 0) >= 5)
      .map((t) => ({ url: `${SITE}/area/${encodeURIComponent(r.area)}/${t.key}`, changeFrequency: "weekly" as const, priority: 0.6 }))
  );
  // 동(洞) 단위 — "정자동 카페"처럼 실검색행태에 가장 가까운 단위(카페 5곳↑ 동만, 얇은 콘텐츠 방지)
  const dongs = await getDongs();
  const dongUrls: MetadataRoute.Sitemap = dongs.map((d) => ({
    url: `${SITE}/area/${encodeURIComponent(d.area)}/dong/${encodeURIComponent(d.dong)}`, changeFrequency: "weekly", priority: 0.65,
  }));
  // 동네 교차검증 컬렉션(에디토리얼 SEO 랜딩) — lib/collections.ts 레지스트리 단일출처.
  const collectionUrls: MetadataRoute.Sitemap = COLLECTIONS.map((c) => ({
    url: `${SITE}/collections/${c.slug}`, changeFrequency: "weekly", priority: 0.85,
  }));
  return [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/area`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/pricing`, changeFrequency: "monthly", priority: 0.5 },
    ...collectionUrls,
    ...tasteUrls,
    ...regionUrls,
    ...regionTasteUrls,
    ...dongUrls,
    ...cafeUrls,
  ];
}
