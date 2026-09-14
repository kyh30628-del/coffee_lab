import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Curated from "../../../../Curated";
import { getDongTasteCafes, getDongTasteCounts, getDongsInArea, tasteByKey, TASTES, SITE, TASTE_MIN_HITS, TASTE_MIN_RATE_PCT, josa } from "@/lib/seoData";

export const revalidate = 2592000; // ISR 30일 — 기존 지역×취향·동 페이지와 같은 규약.

// 💰 빌드 사전생성 0 — 동 페이지에서 검증된 패턴(당시 빌드 -18.7초·-35%).
//   사이트맵에 실려 있어 크롤러 첫 요청 때 그 1건만 만들어지고 30일 캐시된다.
export async function generateStaticParams() { return []; }

type Props = { params: Promise<{ gu: string; dong: string; taste: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gu, dong, taste } = await params;
  const area = decodeURIComponent(gu), d = decodeURIComponent(dong);
  const t = tasteByKey(taste);
  if (!t) return { title: "동네 커피 노트" };
  const [cafes, counts] = await Promise.all([getDongTasteCafes(area, d, taste, 30), getDongTasteCounts()]);
  //   🔴 2026-09-14 실측 수정: 표시 상한(30)을 곳수로 쓰면 "봉천동 디저트 BEST 30"인데 실제는 127곳이었다.
  //      제목은 색인되는 자리다 — 실제 곳수를 쓴다(이미 받아온 카운트라 추가 조회 0).
  const total = counts[`${area}|${d}|${taste}`] ?? cafes.length;
  const names = cafes.map((c) => c.name).slice(0, 3).join(", ");
  const bestN = total >= 5 ? ` BEST ${total}` : "";
  // 제목 머리는 **사람이 치는 말 그대로** — "{동네} {취향} 카페". 구 단위 페이지와 같은 원칙.
  const title = `${d} ${t.label} 카페${bestN} — ${d} ${t.aliases[0]} 검증 추천 | 동네 커피 노트`;
  const ev = cafes.reduce((a, c) => a + (Number(c.count) || 0), 0);
  const a2 = t.aliases.slice(0, 2);
  const desc = `${area} ${d}에서 ${a2.join(", ")}${josa(a2[a2.length - 1] ?? "", "을/를")} 찾는다면. 검증 후기 ${ev.toLocaleString()}건을 근거로 ${t.desc} 카페를 영수증 리뷰·광고 없이 골랐어요.${names ? ` ${names} 등.` : ""}`;
  const url = `${SITE}/area/${encodeURIComponent(area)}/dong/${encodeURIComponent(d)}/${taste}`;
  return { title, description: desc, alternates: { canonical: url },
    openGraph: { title, description: desc, url, siteName: "동네 커피 노트", type: "website", locale: "ko_KR" } };
}

export default async function DongTastePage({ params }: Props) {
  const { gu, dong, taste } = await params;
  const area = decodeURIComponent(gu), d = decodeURIComponent(dong);
  const t = tasteByKey(taste);
  if (!t) notFound();
  const [cafes, allCounts, siblings] = await Promise.all([
    getDongTasteCafes(area, d, taste, 30), getDongTasteCounts(), getDongsInArea(area),
  ]);
  // 근거가 적으면 페이지를 열지 않는다 — 사이트맵 기준(5곳)과 같은 값. 얇은 콘텐츠를 스스로 제출하지 않는다.
  if (cafes.length < 5) notFound();
  // 같은 동의 다른 취향 · 같은 취향의 다른 동 — 둘 다 내부 링크로 열어 크롤러가 타고 다니게 한다.
  const tasteChips = TASTES.filter((x) => (allCounts[`${area}|${d}|${x.key}`] ?? 0) >= 5);
  const sameTasteNearby = Object.entries(allCounts)
    .filter(([k, v]) => k.endsWith(`|${taste}`) && v >= 5 && !k.startsWith(`${area}|${d}|`))
    .map(([k, v]) => ({ area: k.split("|")[1], n: v }))
    .sort((a, b) => b.n - a.n).slice(0, 12);
  const total = allCounts[`${area}|${d}|${taste}`] ?? cafes.length;
  const heading = `${d} ${t.label} 카페${total >= 5 ? ` BEST ${total}` : ""}`;
  const intro = `${d} ${t.aliases.slice(0, 2).join("·")} 찾으시나요? ${area} ${d}에서 ${t.desc} 카페 ${total}곳. 후기에 ${t.short} 이야기가 ${TASTE_MIN_HITS}건 이상, 그 카페 전체 후기의 ${TASTE_MIN_RATE_PCT}% 이상 나온 곳만 골랐어요.`;
  return <Curated area={area} tasteKey={taste} tasteLabel={t.short} tasteEmoji={t.emoji} heading={heading} intro={intro}
    cafes={cafes} sameTasteNearby={sameTasteNearby}
    backHref={`/area/${encodeURIComponent(area)}/dong/${encodeURIComponent(d)}`} backLabel={`${d} 전체`}
    showTasteNav={false}
    crossLinks={tasteChips.filter((x) => x.key !== taste).map((x) => ({ label: `${x.emoji} ${d} ${x.short}`, href: `/area/${encodeURIComponent(area)}/dong/${encodeURIComponent(d)}/${x.key}` }))}
    crossLinksLabel={`${d}의 다른 취향도 보기`}
    canonical={`${SITE}/area/${encodeURIComponent(area)}/dong/${encodeURIComponent(d)}/${taste}`} />;
}
