import type { MetadataRoute } from "next";
import { sql } from "@/lib/db";
import { getRegions, getDongs, getRegionTasteCounts, getRegionFacetCounts, getDongTasteCounts, getDongFacetCounts, TASTES } from "@/lib/seoData";
import { FACET_PAGES, FACET_MIN_CAFES } from "@/lib/facetPages";
import { COLLECTIONS } from "@/lib/collections";

export const runtime = "nodejs";
export const revalidate = 21600; // 감사수리: 결재 집행(공개/비공개) 반영 지연 축소 — 페이지(3600)와 짝 맞춤

const SITE = "https://dongnecoffeenote.com";

// 📑 2026-09-15 — 유형별 사이트맵을 **추가로** 제공한다(CEO 승인).
//   왜: 34,455 URL이 단일 5.7MB 파일이라 Search Console에서 **유형별 색인 수를 볼 수 없다.**
//   09-28에 "기존 페이지 색인이 늦어졌는지"를 판단하려면 카페상세·지역×취향·시설축을 따로 봐야 한다.
//   ⚠️ **/sitemap.xml은 그대로 둔다** — IndexNow(scripts/indexnow-submit.mjs)와 robots.txt가 이 주소를 읽는다.
//      분할(generateSitemaps)로 바꾸면 /sitemap.xml이 사라져 제출이 통째로 끊긴다(빌드로 확인하고 되돌림).
//      대신 /sitemaps/{유형}.xml을 **덧붙이고** robots.txt에 함께 싣는다. 같은 URL이 두 사이트맵에 있어도 무방하다.
export type SitemapKind = "cafes" | "areas" | "taste" | "facet" | "dong" | "dongtaste" | "dongfacet" | "misc";
export async function sitemapByKind(kind: SitemapKind): Promise<MetadataRoute.Sitemap> {
  const all = await buildAll();
  return all[kind] ?? [];
}

async function buildAll(): Promise<Record<SitemapKind, MetadataRoute.Sitemap>> {
  const s = await sitemapParts();
  return s;
}

// 🔴 2026-09-16 — 통합 사이트맵에서 **동×취향·동×시설을 뺀다**(CEO 승인). 페이지는 그대로 살아 있고
//   제출만 멈춘다. `/sitemaps/dongtaste.xml`·`/sitemaps/dongfacet.xml`은 유지되므로 필요하면 개별 제출 가능.
//
//   근거(서치콘솔 실측 2026-09-16):
//     사이트맵 제출 34,455 → **색인 3,100(9%)** · 미색인 19,800
//     미색인 사유 1위 = "발견됨 — 현재 색인 생성 안 됨" **18,318개**(구글이 크롤링조차 안 함)
//     09-14 개방 직전엔 이 대기열이 12,069였다 → 4,835페이지를 더 열고 **6,249 늘었다.**
//   그리고 노출 상위 10개 페이지가 홈 1개 + **카페 상세 9개**다. 동×취향은 구글 노출이 사실상 0.
//   → 크롤 예산은 정해져 있다. 구글에서 한 번도 안 뜨는 유형이 예산을 먹으면 카페 상세가 굶는다.
//
//   ⚠️ 네이버 리스크 판단: 네이버 유입의 74%가 지역×취향/동 계열이다. 그래서 겁나는 조치다.
//     다만 사이트맵은 **발견 힌트이지 색인 지시가 아니다** — 이미 색인된 페이지는 빠지지 않는다.
//     영향은 '앞으로 새로 생기는 동×취향의 네이버 발견이 느려지는 것'에 한정된다.
//   🔙 되돌림 조건: 2주 내 네이버 경유 동 계열 유입이 20% 이상 줄면 즉시 원복(이 줄만 되돌리면 된다).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const p = await sitemapParts();
  return [...p.misc, ...p.areas, ...p.taste, ...p.facet, ...p.dong, ...p.cafes];
}

async function sitemapParts(): Promise<Record<SitemapKind, MetadataRoute.Sitemap>> {
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
  // 🅿️ 시설축(결재 #1083 1단계, 2026-09-14) — "목동 주차 가능한 카페"처럼 사람들이 실제로 치는 형태.
  //   데이터는 원래 있었는데(cafes.facets) URL이 없어 노출이 0이었다. 지역×취향과 같은 기준(5곳 이상)만 제출한다.
  //   ⚠️ 크롤 예산이 유일한 실질 리스크다(현재 12,069개가 '발견됐지만 크롤 대기').
  //      그래서 **1단계는 시설축만** 올리고 2주 관찰 후 동×취향을 연다 — 한 번에 5,950개를 열지 않는다.
  const facetCounts = await getRegionFacetCounts();
  const facetUrls: MetadataRoute.Sitemap = regions.flatMap((r) =>
    FACET_PAGES.filter((f) => (facetCounts[`${r.area}|${f.label}`] ?? 0) >= FACET_MIN_CAFES)
      .map((f) => ({ url: `${SITE}/area/${encodeURIComponent(r.area)}/f/${f.slug}`, changeFrequency: "weekly" as const, priority: 0.62 }))
  );
  // 동(洞) 단위 — "정자동 카페"처럼 실검색행태에 가장 가까운 단위(카페 5곳↑ 동만, 얇은 콘텐츠 방지)
  const dongs = await getDongs();
  const dongUrls: MetadataRoute.Sitemap = dongs.map((d) => ({
    url: `${SITE}/area/${encodeURIComponent(d.area)}/dong/${encodeURIComponent(d.dong)}`, changeFrequency: "weekly", priority: 0.65,
  }));
  // 🏘️ 동×취향(결재 #1083 2단계, CEO 지시 2026-09-14 "지금 열어") — "연남동 카공 카페"처럼
  //   사람이 실제로 치는 형태. 채택 기준은 지역×취향과 **완전히 동일**하고 5곳 이상만 제출한다.
  //   ⚠️ 크롤 예산: 이미 12,069개가 '발견됐지만 크롤 대기'인데 여기서 5천여 개가 더 들어간다.
  //      CEO 결정으로 1단계 관찰 없이 연다 — 기존 색인 지연 여부를 09-28 스팟체크에서 반드시 확인할 것.
  const dongTasteCounts = await getDongTasteCounts();
  const dongTasteUrls: MetadataRoute.Sitemap = Object.entries(dongTasteCounts)
    .filter(([, n]) => n >= 5)
    .map(([k]) => { const [a, d, t] = k.split("|");
      return { url: `${SITE}/area/${encodeURIComponent(a)}/dong/${encodeURIComponent(d)}/${t}`, changeFrequency: "weekly" as const, priority: 0.6 }; });
  // 🅿️🏘️ 동×시설(2026-09-14) — 경쟁사가 1위인 자리가 정확히 이 형태다("목동 주차 가능한 카페").
  //   실측 369개뿐(주차 142·수제베이킹 66·데이트 39…)이고 ISR 30일이라 하루 12회 재생성. 사실상 공짜.
  const dongFacetCounts = await getDongFacetCounts();
  const facetLabels = new Set(FACET_PAGES.map((f) => f.label));
  const slugByLabel = new Map(FACET_PAGES.map((f) => [f.label, f.slug]));
  const dongFacetUrls: MetadataRoute.Sitemap = Object.entries(dongFacetCounts)
    .filter(([k, n]) => n >= FACET_MIN_CAFES && facetLabels.has(k.split("|")[2]))
    .map(([k]) => { const [a, d, label] = k.split("|");
      return { url: `${SITE}/area/${encodeURIComponent(a)}/dong/${encodeURIComponent(d)}/f/${slugByLabel.get(label)}`, changeFrequency: "weekly" as const, priority: 0.63 }; });
  // 동네 교차검증 컬렉션(에디토리얼 SEO 랜딩) — lib/collections.ts 레지스트리 단일출처.
  const collectionUrls: MetadataRoute.Sitemap = COLLECTIONS.map((c) => ({
    url: `${SITE}/collections/${c.slug}`, changeFrequency: "weekly", priority: 0.85,
  }));
  const misc: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/area`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/insights`, changeFrequency: "daily", priority: 0.7 }, // 📊 데이터 리포트(인용 유도 — 백링크 전략)
    { url: `${SITE}/new`, changeFrequency: "daily", priority: 0.8 }, // 🆕 새 발굴(P2, 2026-08-13)
    { url: `${SITE}/trust`, changeFrequency: "monthly", priority: 0.7 }, // 🛡️ 검증 방법론(벤치마킹 A, 2026-08-13)
    { url: `${SITE}/pricing`, changeFrequency: "monthly", priority: 0.5 },
    ...collectionUrls,
    ...tasteUrls,
  ];
  return { misc, areas: regionUrls, taste: regionTasteUrls, facet: facetUrls,
    dong: dongUrls, dongtaste: dongTasteUrls, dongfacet: dongFacetUrls, cafes: cafeUrls };
}
