import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Curated from "../../Curated";
import { getRegions, getRegionTasteCafes, getRegionTasteCount, getRegionTasteCounts, getRegionTasteGradeBreakdown, areaAliases, TASTES, tasteByKey, SITE, TASTE_MIN_HITS, TASTE_MIN_RATE_PCT } from "@/lib/seoData";

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
  const areaShort2 = areaAliases(area)[0];
  // BEST N 프레이밍(2026-08-13 벤치마킹 B — 다이닝코드 Top100 상품화 차용). ⚠️ 기존 네이버 랭킹 보호:
  //   검색어 머리("{지역} {테마} 카페")는 그대로 두고 BEST N을 덧붙이기만 한다(제목 전면 교체 금지).
  //   ⚠️ 위 cafes는 미리보기 5건 조회라 length를 쓰면 항상 "BEST 5"가 된다 — 본문과 같은 기준(표시 상한 30)으로 계산.
  const totalForTitle = await getRegionTasteCount(area, taste);
  const shownN = Math.min(totalForTitle || cafes.length, 30);
  const bestN = shownN >= 5 ? ` BEST ${shownN}` : "";
  // 🔍 검색어 정합(2026-08-15): 제목 **머리는 그대로 두고** 실제 검색 표현만 뒤에 병기한다.
  //   실측 근거 — "안산시 작업하기 좋은 카페 검증"은 10위 안 10개가 전부 우리 페이지인데
  //   정작 사람들이 치는 "안산 카공 카페 추천"에는 한 개도 안 잡혔다(같은 페이지, 표현만 다름).
  //   머리를 바꾸면 지금 1위인 것들이 흔들리므로 덧붙이기만 한다(BEST N 때와 같은 안전 원칙).
  const alias1 = t.aliases[0] ?? `${t.label} 카페`;
  const areaShort = areaAliases(area)[0];
  const title = `${area} ${t.label} 카페${bestN} — ${areaShort ? `${areaShort} ` : ""}${alias1} 검증 추천 | 동네 커피 노트`;
  const aliasPhrase = t.aliases.slice(0, 3).join(", ");
  const desc = `${areaShort2 ? `${areaShort2}·` : ""}${area}에서 ${aliasPhrase}를 찾는다면. ${t.desc} 카페를 영수증 리뷰·광고 없이 진짜 후기로 검증해 골랐어요.${names ? ` ${names} 등.` : ""}`;
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
  // 🧭 동선 데이터(2026-08-15): 전 지역×테마 카운트 1회 조회로 ①이 지역의 테마별 개수(빈 칩 숨김)
  //   ②같은 테마 다른 동네 링크를 동시에 만든다. 집계 1회·작은 컬럼뿐, ISR 30분 캐시라 부하 무시 수준.
  const [cafes, regions, total, grades, allCounts] = await Promise.all([
    getRegionTasteCafes(area, taste, 30), getRegions(), getRegionTasteCount(area, taste),
    getRegionTasteGradeBreakdown(area, taste), getRegionTasteCounts(),
  ]);
  const tasteCounts: Record<string, number> = {};
  for (const t of TASTES) tasteCounts[t.key] = allCounts[`${area}|${t.key}`] ?? 0;
  // 같은 테마 보유량이 많은 다른 동네 순 — 빈 페이지로 보내지 않도록 5곳 이상만(sitemap 기준과 동일).
  const sameTasteNearby = Object.entries(allCounts)
    .filter(([k, v]) => k.endsWith(`|${taste}`) && v >= 5 && !k.startsWith(`${area}|`))
    .map(([k, v]) => ({ area: k.split("|")[0], n: v }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);
  const shownN2 = Math.min(total || cafes.length, 30);
  const heading = `${area} ${t.label} 카페${shownN2 >= 5 ? ` BEST ${shownN2}` : ""}`;
  // 카피는 실제 채택 기준과 정확히 일치해야 한다(예전엔 '언급 1회'도 포함해 놓고 "N곳 검증"이라 적었다).
  // 본문에도 실제 검색 표현을 자연스럽게 넣는다 — 제목만 바꾸면 검색엔진이 관련성을 인정하지 않는다.
  //   과장·나열 금지: 어떻게 골랐는지 설명하는 기존 문장은 그대로 두고 한 문장만 앞에 덧붙인다.
  const aliasIntro = t.aliases.slice(0, 2).join("·");
  const areaBare = areaAliases(area)[0] || area;
  const intro = `${areaBare} ${aliasIntro} 찾으시나요? ${area}에서 ${t.desc} 카페 ${total || cafes.length}곳. 후기에 ${t.short} 이야기가 ${TASTE_MIN_HITS}건 이상, 그 카페 전체 후기의 ${TASTE_MIN_RATE_PCT}% 이상 나온 곳만 골랐어요.`;
  return <Curated area={area} tasteKey={taste} tasteLabel={t.short} tasteEmoji={t.emoji} heading={heading} intro={intro} cafes={cafes} regions={regions} grades={grades} tasteCounts={tasteCounts} sameTasteNearby={sameTasteNearby} canonical={`${SITE}/area/${encodeURIComponent(area)}/${taste}`} />;
}
