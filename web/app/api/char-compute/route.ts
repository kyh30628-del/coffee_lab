import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";
export const maxDuration = 60;

export const CHAR_AXES = [
  { key: "roast", label: "직접로스팅", emoji: "🔥", kws: ["로스팅","로스터리","직접 볶","자가배전","스페셜티","싱글오리진"], pick: true },
  { key: "work", label: "작업·공부", emoji: "💻", kws: ["작업","노트북","공부","콘센트","집중","와이파이"], pick: true },
  { key: "quiet", label: "조용·혼자", emoji: "🤍", kws: ["조용","차분","혼자","고요","사색","한적"], pick: true },
  { key: "dessert", label: "디저트", emoji: "🍰", kws: ["디저트","케이크","스콘","크로플","티라미수","베이커리","쿠키","빵"], pick: true },
  { key: "mood", label: "분위기", emoji: "📸", kws: ["분위기","예쁜","감성","인테리어","사진","뷰","루프탑","아늑"], pick: false },
  { key: "space", label: "넓은공간", emoji: "🪑", kws: ["넓","대형","규모","테라스","주차"], pick: false },
];
function score(text: string, kws: string[]): number {
  return kws.reduce((s, k) => s + (text.split(k).length - 1), 0);
}

// POST { limit?: 100 } — 아직 char_scores 없는 카페부터 limit개씩 처리
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS char_scores JSONB`;
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 300);

    const rows = await sql`
      SELECT id, synth_identity, synth_reviews FROM cafes
      WHERE published = true AND char_scores IS NULL
      LIMIT ${limit}` as unknown as any[];

    let updated = 0;
    for (const r of rows) {
      const texts: string[] = [];
      if (r.synth_identity) texts.push(r.synth_identity);
      if (Array.isArray(r.synth_reviews)) r.synth_reviews.forEach((x: any) => x.quote && texts.push(x.quote));
      const blob = texts.join(" ");
      const scores: Record<string, number> = {};
      for (const ax of CHAR_AXES) scores[ax.key] = score(blob, ax.kws);
      await sql`UPDATE cafes SET char_scores=${JSON.stringify(scores)} WHERE id=${r.id}`;
      updated++;
    }
    const remain = (await sql`SELECT COUNT(*)::int AS n FROM cafes WHERE published = true AND char_scores IS NULL`)[0].n;
    return NextResponse.json({ ok: true, updated, remaining: remain });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// GET — 진행 현황만 확인
export async function GET() {
  try {
    await ensureSchema();
    const done = (await sql`SELECT COUNT(*)::int AS n FROM cafes WHERE published = true AND char_scores IS NOT NULL`)[0].n;
    const remain = (await sql`SELECT COUNT(*)::int AS n FROM cafes WHERE published = true AND char_scores IS NULL`)[0].n;
    return NextResponse.json({ ok: true, done, remaining: remain });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
