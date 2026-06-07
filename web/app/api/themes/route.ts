import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

type Cafe = {
  id: number; name: string; area: string; note: string; uses: string;
  roasts_own: boolean; acidity: number; body: number; sweet: number;
  signature: string; tone: string; photo_url: string | null; rating: number;
};

export async function GET() {
  try {
    await ensureSchema();
    // 거대 컬럼(raw_reviews·synth_reviews·embedding) 제외 — Neon 507 방지
    const rows = (await sql`SELECT id, name, area, note, uses, roasts_own, acidity, body, sweet, signature, tone, photo_url
      FROM cafes WHERE published=true`) as unknown as Cafe[];
    const has = (c: Cafe, u: string) => (c.uses ?? "").split(",").includes(u);

    // 규칙 기반 테마 — 데이터 늘면 자동으로 풍부해짐
    const themes = [
      {
        key: "work", emoji: "💻", title: "오래 작업하기 좋은 곳",
        desc: "노트북 펴고 두세 시간 머물기 좋은, 자리·분위기 받쳐주는 동네 카페",
        cafes: rows.filter((c) => has(c, "작업")),
      },
      {
        key: "acidity", emoji: "🍋", title: "산미 러버를 위한 픽",
        desc: "밝고 또렷한 산미·꽃향을 좋아한다면 여기부터",
        cafes: rows.filter((c) => (c.acidity ?? 0) >= 0.65).sort((a, b) => b.acidity - a.acidity),
      },
      {
        key: "deep", emoji: "🍫", title: "진하고 묵직한 한 잔",
        desc: "산미보다 바디·다크초콜릿 무드. 든든하게 마시고 싶을 때",
        cafes: rows.filter((c) => (c.body ?? 0) >= 0.65).sort((a, b) => b.body - a.body),
      },
      {
        key: "roaster", emoji: "🔥", title: "직접 볶는 진짜 로스터리",
        desc: "매장에서 직접 로스팅하는, 커피에 진심인 집들",
        cafes: rows.filter((c) => c.roasts_own),
      },
      {
        key: "quiet", emoji: "🤍", title: "혼자 조용히 사색하기",
        desc: "말수 적은 날, 커피와 나만 있고 싶을 때",
        cafes: rows.filter((c) => has(c, "혼자") || has(c, "조용")),
      },
      {
        key: "sweet", emoji: "🥐", title: "달콤하게, 디저트까지",
        desc: "단 거 좋아하거나 빵·디저트 곁들이고 싶을 때",
        cafes: rows.filter((c) => (c.sweet ?? 0) >= 0.65 || has(c, "빵")),
      },
    ].filter((t) => t.cafes.length > 0)
     .map((t) => ({ ...t, cafes: t.cafes.slice(0, 6) }));

    return NextResponse.json({ themes, total: rows.length });
  } catch (e) {
    return NextResponse.json({ themes: [], error: String(e) }, { status: 500 });
  }
}
