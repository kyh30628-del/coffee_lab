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
];
export const tasteByKey = (k: string) => TASTES.find((t) => t.key === k);

export type SeoCafe = { id: number; name: string; dong: string | null; grade: string | null; count: number | null; identity: string | null; quote: string | null };

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
      (SELECT left(r->>'quote', 70) FROM jsonb_array_elements(COALESCE(synth_reviews,'[]'::jsonb)) r
        WHERE COALESCE(r->>'quote','') <> '' ORDER BY COALESCE((r->>'score')::int,0) DESC LIMIT 1) AS quote
      FROM cafes WHERE published AND area=${area} AND COALESCE((char_scores->>${tasteKey})::int, 0) > 0
      ORDER BY (char_scores->>${tasteKey})::int DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[];
  } catch { return []; }
}

// 지역×취향 공개 카페 곳수 — 취향 페이지 "N곳" 카피의 실제 값(표시 30개를 곳수로 오용 금지).
export async function getRegionTasteCount(area: string, tasteKey: string): Promise<number> {
  try {
    return Number(((await sql`SELECT count(*)::int n FROM cafes WHERE published AND area=${area} AND COALESCE((char_scores->>${tasteKey})::int, 0) > 0`)[0] as any)?.n ?? 0);
  } catch { return 0; }
}

// 지역×취향 후기 근거 등급 분포(검증/참고/후보) — 표시 30개가 아닌 전체 모수 기준. 콘텐츠 밀도 보강용 근거 요약.
export type GradeBreakdown = { verified: number; ref: number; candidate: number };
export async function getRegionTasteGradeBreakdown(area: string, tasteKey: string): Promise<GradeBreakdown> {
  try {
    const rows = (await sql`SELECT synth_grade AS grade, count(*)::int n FROM cafes
      WHERE published AND area=${area} AND COALESCE((char_scores->>${tasteKey})::int, 0) > 0
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
