import { TASTES, TASTE_MIN_HITS, TASTE_MIN_RATE_PCT } from "./seoData";
import { FACET_PAGES } from "./facetPages";
import { collectionForCafe } from "./collections";

// 🎯 카페 1곳이 "실려 있는" 목록 페이지 계산 — 표적 무효화의 단일 출처(2026-10-10, CEO "ISR·재생성 제대로").
//
// ## 왜
//   예전 무효화는 카페 1곳이 바뀌면 `/area/[gu]/[taste]` 같은 **유형 전체**(약 4,163페이지)를 지웠다.
//   크롤러가 그 식은 페이지를 다시 밟을 때마다 재생성 = ISR Write가 쌓였다(10월 초 비용 비상의 64%).
//   → 카페가 실제로 나오는 페이지만 지운다. 바뀌기 전 집합 ∪ 바뀐 후 집합을 지우면 빠짐도 남음도 없다.
//
// ## 규칙 = 각 목록 쿼리(lib/seoData.ts)의 **느슨한 상위집합**
//   목록에 실릴 수 있는 페이지를 하나라도 빼면 그 화면에 옛 상태가 남는다(거짓 노출).
//   반대로 실리지 않는 페이지를 몇 개 더 넣는 건 "표시만 하고 방문 때 재생성"이라 비용이 거의 없다.
//   그래서 취향은 축별 엄격 비율·지배축 검사를 생략하고 가장 느슨한 기준(hits≥3·5%)만 쓴다.
//   ⚠️ seoData의 목록 조건을 **넓히면** 여기도 같이 넓힐 것(좁히는 건 그대로 둬도 안전).
//
// 토큰(@로 시작)은 경로가 아니라 상태 표식 — 공개/등급이 바뀌었는지 이전 집합과 비교하는 데 쓴다.

export type CachePageRow = {
  published: boolean | null;
  area: string | null;
  dong: string | null;
  synth_grade: string | null;
  synth_count: number | null;
  char_scores: Record<string, unknown> | null;
  facets: string[] | null;
  created_at: string | Date | null;
};

export const PUB_TOKEN = "@pub";
export const isToken = (p: string) => p.startsWith("@");

const NEW_WINDOW_MS = 31 * 86400_000; // /new는 30일 — 하루 여유

function tasteKeys(row: CachePageRow): string[] {
  const cs = row.char_scores || {};
  const count = Number(row.synth_count ?? 0) || 0;
  return TASTES.map((t) => t.key).filter((k) => {
    const hits = Number((cs as Record<string, unknown>)[k] ?? 0) || 0;
    return hits >= TASTE_MIN_HITS && hits * 100 >= count * TASTE_MIN_RATE_PCT;
  });
}

/** 공개 카페가 실릴 수 있는 목록 경로(인코딩 전 원문) + 상태 토큰. 비공개면 빈 배열. */
export function pagesForCafe(row: CachePageRow): string[] {
  if (!row.published) return [];
  const out = new Set<string>([PUB_TOKEN, `@g:${row.synth_grade ?? ""}`]);
  const area = (row.area || "").trim();
  const created = row.created_at ? new Date(row.created_at).getTime() : NaN;
  if (Number.isFinite(created) && Date.now() - created < NEW_WINDOW_MS) out.add("/new");
  if (!area) return [...out];

  const tastes = tasteKeys(row);
  const facetSlugs = FACET_PAGES.filter((f) => (row.facets || []).includes(f.label)).map((f) => f.slug);

  const g = `/area/${area}`;
  out.add(g);
  out.add(`${g}/opengraph-image`);
  for (const t of tastes) { out.add(`${g}/${t}`); out.add(`${g}/${t}/opengraph-image`); }
  for (const s of facetSlugs) out.add(`${g}/f/${s}`);

  const dong = (row.dong || "").trim();
  if (dong) {
    // 통칭 동(성수동1가 → 성수동) 페이지도 같은 카페를 싣는다(seoData.resolveDongNames).
    const dongs = new Set([dong]);
    const m = dong.match(/^(.+?)[0-9]+가$/);
    if (m) dongs.add(m[1]);
    for (const d of dongs) {
      const dp = `${g}/dong/${d}`;
      out.add(dp);
      out.add(`${dp}/opengraph-image`);
      for (const t of tastes) out.add(`${dp}/${t}`);
      for (const s of facetSlugs) out.add(`${dp}/f/${s}`);
    }
    const col = collectionForCafe(dong, area);
    if (col) { out.add(`/collections/${col.slug}`); out.add(`/collections/${col.slug}/opengraph-image`); }
  }
  return [...out];
}
