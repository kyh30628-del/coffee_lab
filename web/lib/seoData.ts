import { sql } from "@/lib/db";

// 프로그래매틱 SEO(동네×취향) 데이터 — 검증 카페 목록을 지역·취향별로 조회.
export const SITE = "https://dongnecoffeenote.com";
export const OG_HINT = "영수증 리뷰·광고 빼고 진짜 후기로 검증 · dongnecoffeenote.com";

export type Taste = { key: string; label: string; short: string; emoji: string; desc: string };
// char_scores 키와 1:1 (mood/work/quiet/roast/space/dessert)
export const TASTES: Taste[] = [
  { key: "work", label: "작업하기 좋은", short: "카공", emoji: "💻", desc: "노트북·콘센트·집중하기 좋은" },
  { key: "quiet", label: "조용한", short: "혼자", emoji: "🤍", desc: "혼자 차분히 머물기 좋은" },
  { key: "dessert", label: "디저트 맛집", short: "디저트", emoji: "🍰", desc: "달콤한 디저트가 맛있는" },
  { key: "roast", label: "스페셜티·로스팅", short: "스페셜티", emoji: "🔥", desc: "직접 로스팅·원두에 진심인" },
  { key: "mood", label: "분위기 좋은", short: "감성", emoji: "📸", desc: "분위기·사진이 예쁜" },
  { key: "space", label: "넓은 대형", short: "대형", emoji: "🪑", desc: "넓고 좌석이 많은" },
  // 2026-08-13 신설(P1 — CEO 승인): 데이터랩 수요 1·2위 테마. char 축과 키 동일(파이프라인 자동 연동).
  { key: "pet", label: "애견동반", short: "반려동반", emoji: "🐶", desc: "반려견과 함께 갈 수 있는" },
  { key: "brunch", label: "브런치 맛집", short: "브런치", emoji: "🥐", desc: "브런치 메뉴가 맛있는" },
  { key: "view", label: "뷰 좋은", short: "뷰맛집", emoji: "🌄", desc: "창밖 풍경·전망이 좋은" },
];
export const tasteByKey = (k: string) => TASTES.find((t) => t.key === k);

export type SeoCafe = { id: number; name: string; dong: string | null; grade: string | null; count: number | null; identity: string | null; quote: string | null; tasteHits?: number | null };

// 🎯 취향 페이지 채택 기준(2026-08-06, CEO "기준 상향") — 예전엔 `char_scores.<취향> > 0`,
//   즉 **후기에 딱 한 번 스쳐도 포함**이었다. 그 결과 "파주시 작업하기 좋은 카페 117곳"인데 실제로
//   작업 언급이 3건 이상인 곳은 37곳뿐이라, 네이버에서 '카공 카페'로 들어온 사람이 만나는 첫 화면이
//   약속과 어긋났다(최대 유입 페이지 UV 1,040/30일).
//   새 기준 = ①절대 근거 3건 이상 ②그 카페 전체 후기의 5% 이상(후기 20건당 1건 이상 그 얘기가 나옴).
//   ①만으로는 후기 300건짜리 대형카페가 3건으로 통과하고, ②만으로는 후기 5건짜리가 1건으로 통과한다.
//   ⚠️ 목록·곳수·등급분포 **세 쿼리가 반드시 같은 조건**을 써야 한다(예전 버그의 본질 = 표시와 카피 불일치).
//   (neon 태그드 템플릿은 조각 합성이 안 되므로 조건을 각 쿼리에 같은 형태로 적어 둔다 — 바꿀 땐 전부 함께.)
// ⚠️ 비율은 **정수 백분율로만** 다룬다(`언급×100 >= 후기×5`). 소수 0.05를 파라미터로 넘기면 Postgres가
//   정수 문맥에서 $n을 integer로 추론해 `invalid input syntax for type integer: "0.05"`로 죽고,
//   호출부 try/catch가 그걸 빈 배열로 삼켜 **페이지가 조용히 0곳이 된다**(구현 중 실제로 밟은 함정).
export const TASTE_MIN_HITS = 3;
export const TASTE_MIN_RATE_PCT = 5;

export async function getRegions(): Promise<{ area: string; n: number }[]> {
  try {
    return (await sql`SELECT area, count(*)::int n FROM cafes WHERE published AND area IS NOT NULL AND area <> '' GROUP BY area HAVING count(*) >= 5 ORDER BY n DESC`) as unknown as { area: string; n: number }[];
  } catch { return []; }
}

export async function getRegionCafes(area: string, limit = 30): Promise<SeoCafe[]> {
  try {
    return (await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity,
      (SELECT left(r->>'quote', 70) FROM jsonb_array_elements(COALESCE(synth_reviews,'[]'::jsonb)) r
        WHERE COALESCE(r->>'quote','') <> '' ORDER BY COALESCE((r->>'score')::int,0) DESC LIMIT 1) AS quote
      FROM cafes WHERE published AND area=${area}
      ORDER BY (synth_grade='검증') DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[];
  } catch { return []; }
}

export async function getRegionTasteCafes(area: string, tasteKey: string, limit = 30): Promise<SeoCafe[]> {
  try {
    return (await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity,
      (char_scores->>${tasteKey})::int AS "tasteHits",
      (SELECT left(r->>'quote', 70) FROM jsonb_array_elements(COALESCE(synth_reviews,'[]'::jsonb)) r
        WHERE COALESCE(r->>'quote','') <> '' ORDER BY COALESCE((r->>'score')::int,0) DESC LIMIT 1) AS quote
      FROM cafes WHERE published AND area=${area}
        AND COALESCE((char_scores->>${tasteKey})::int, 0) >= ${TASTE_MIN_HITS}
        AND COALESCE((char_scores->>${tasteKey})::int, 0) * 100 >= COALESCE(synth_count,0) * ${TASTE_MIN_RATE_PCT}
      ORDER BY (char_scores->>${tasteKey})::int DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[];
  } catch { return []; }
}

// 지역×취향 공개 카페 곳수 — 취향 페이지 "N곳" 카피의 실제 값(표시 30개를 곳수로 오용 금지).
export async function getRegionTasteCount(area: string, tasteKey: string): Promise<number> {
  try {
    return Number(((await sql`SELECT count(*)::int n FROM cafes WHERE published AND area=${area}
      AND COALESCE((char_scores->>${tasteKey})::int, 0) >= ${TASTE_MIN_HITS}
      AND COALESCE((char_scores->>${tasteKey})::int, 0) * 100 >= COALESCE(synth_count,0) * ${TASTE_MIN_RATE_PCT}`)[0] as any)?.n ?? 0);
  } catch { return 0; }
}

// 전 지역×전 취향 곳수를 **쿼리 1회**로 — 사이트맵이 얇은 페이지(기준 미달)를 제출하지 않게 거르는 용도.
//   지역 68 × 취향 6 = 408번 개별 조회는 비용상 금지([[feedback_cost_discipline_hard]]).
export async function getRegionTasteCounts(): Promise<Record<string, number>> {
  try {
    const rows = (await sql`SELECT area,
      COUNT(*) FILTER (WHERE COALESCE((char_scores->>'work')::int,0) >= 3 AND COALESCE((char_scores->>'work')::int,0) * 100 >= COALESCE(synth_count,0) * 5)::int work,
      COUNT(*) FILTER (WHERE COALESCE((char_scores->>'quiet')::int,0) >= 3 AND COALESCE((char_scores->>'quiet')::int,0) * 100 >= COALESCE(synth_count,0) * 5)::int quiet,
      COUNT(*) FILTER (WHERE COALESCE((char_scores->>'dessert')::int,0) >= 3 AND COALESCE((char_scores->>'dessert')::int,0) * 100 >= COALESCE(synth_count,0) * 5)::int dessert,
      COUNT(*) FILTER (WHERE COALESCE((char_scores->>'roast')::int,0) >= 3 AND COALESCE((char_scores->>'roast')::int,0) * 100 >= COALESCE(synth_count,0) * 5)::int roast,
      COUNT(*) FILTER (WHERE COALESCE((char_scores->>'mood')::int,0) >= 3 AND COALESCE((char_scores->>'mood')::int,0) * 100 >= COALESCE(synth_count,0) * 5)::int mood,
      COUNT(*) FILTER (WHERE COALESCE((char_scores->>'space')::int,0) >= 3 AND COALESCE((char_scores->>'space')::int,0) * 100 >= COALESCE(synth_count,0) * 5)::int space
      FROM cafes WHERE published AND area IS NOT NULL AND area <> '' GROUP BY area`) as unknown as Record<string, any>[];
    const out: Record<string, number> = {};
    for (const r of rows) for (const t of TASTES) out[`${r.area}|${t.key}`] = Number(r[t.key] ?? 0);
    return out;
  } catch { return {}; }
}

// 지역×취향 후기 근거 등급 분포(검증/참고/후보) — 표시 30개가 아닌 전체 모수 기준. 콘텐츠 밀도 보강용 근거 요약.
export type GradeBreakdown = { verified: number; ref: number; candidate: number };
export async function getRegionTasteGradeBreakdown(area: string, tasteKey: string): Promise<GradeBreakdown> {
  try {
    const rows = (await sql`SELECT synth_grade AS grade, count(*)::int n FROM cafes
      WHERE published AND area=${area}
        AND COALESCE((char_scores->>${tasteKey})::int, 0) >= ${TASTE_MIN_HITS}
        AND COALESCE((char_scores->>${tasteKey})::int, 0) * 100 >= COALESCE(synth_count,0) * ${TASTE_MIN_RATE_PCT}
      GROUP BY synth_grade`) as unknown as { grade: string | null; n: number }[];
    const find = (g: string) => rows.find((r) => r.grade === g)?.n ?? 0;
    return { verified: find("검증"), ref: find("참고"), candidate: find("후보") };
  } catch { return { verified: 0, ref: 0, candidate: 0 }; }
}

// 동(洞) 단위 프로그래매틱 SEO — "정자동 카페"처럼 실제 검색행태와 가장 가까운 단위(서비스명 "동네" 그 자체).
// 콘텐츠 얇음(thin content) 방지용 최소 카페수 기준은 구 단위(getRegions)와 동일한 5곳.
export async function getDongs(minCount = 5): Promise<{ area: string; dong: string; n: number }[]> {
  try {
    return (await sql`SELECT area, dong, count(*)::int n FROM cafes
      WHERE published AND area IS NOT NULL AND area <> '' AND dong IS NOT NULL AND dong <> ''
      GROUP BY area, dong HAVING count(*) >= ${minCount} ORDER BY n DESC`) as unknown as { area: string; dong: string; n: number }[];
  } catch { return []; }
}

// 같은 구 안의 다른 동 목록 — 동 페이지 하단 크로스링크(내부링크로 크롤 확산)용.
export async function getDongsInArea(area: string, minCount = 5): Promise<{ dong: string; n: number }[]> {
  try {
    return (await sql`SELECT dong, count(*)::int n FROM cafes
      WHERE published AND area=${area} AND dong IS NOT NULL AND dong <> ''
      GROUP BY dong HAVING count(*) >= ${minCount} ORDER BY n DESC`) as unknown as { dong: string; n: number }[];
  } catch { return []; }
}

export async function getDongCafes(area: string, dong: string, limit = 30): Promise<SeoCafe[]> {
  try {
    return (await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity,
      (SELECT left(r->>'quote', 70) FROM jsonb_array_elements(COALESCE(synth_reviews,'[]'::jsonb)) r
        WHERE COALESCE(r->>'quote','') <> '' ORDER BY COALESCE((r->>'score')::int,0) DESC LIMIT 1) AS quote
      FROM cafes WHERE published AND area=${area} AND dong=${dong}
      ORDER BY (synth_grade='검증') DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[];
  } catch { return []; }
}

// 동 공개 카페 곳수 — "N곳" 카피의 실제 값(표시 30개를 곳수로 오용 금지, lib/region.ts regionPublishedCount와 동일 원칙).
export async function getDongPublishedCount(area: string, dong: string): Promise<number> {
  try { return Number(((await sql`SELECT count(*)::int n FROM cafes WHERE published AND area=${area} AND dong=${dong}`)[0] as any)?.n ?? 0); }
  catch { return 0; }
}
