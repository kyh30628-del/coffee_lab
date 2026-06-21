import { sql } from "@/lib/db";

// 프로그래매틱 SEO(동네×취향) 데이터 — 검증 카페 목록을 지역·취향별로 조회.
export const SITE = "https://dongnecoffeenote.com";

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

export type SeoCafe = { id: number; name: string; dong: string | null; grade: string | null; count: number | null; identity: string | null };

export async function getRegions(): Promise<{ area: string; n: number }[]> {
  try {
    return (await sql`SELECT area, count(*)::int n FROM cafes WHERE published AND area IS NOT NULL AND area <> '' GROUP BY area HAVING count(*) >= 5 ORDER BY n DESC`) as unknown as { area: string; n: number }[];
  } catch { return []; }
}

export async function getRegionCafes(area: string, limit = 30): Promise<SeoCafe[]> {
  try {
    return (await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity
      FROM cafes WHERE published AND area=${area}
      ORDER BY (synth_grade='검증') DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[];
  } catch { return []; }
}

export async function getRegionTasteCafes(area: string, tasteKey: string, limit = 30): Promise<SeoCafe[]> {
  try {
    return (await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity
      FROM cafes WHERE published AND area=${area} AND COALESCE((char_scores->>${tasteKey})::int, 0) > 0
      ORDER BY (char_scores->>${tasteKey})::int DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[];
  } catch { return []; }
}
