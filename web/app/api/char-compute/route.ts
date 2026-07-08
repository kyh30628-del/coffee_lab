import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { computeCharScores } from "@/lib/charScore";
import { loadCriteriaLists } from "@/lib/criteriaLists";
export const runtime = "nodejs";
export const maxDuration = 60;

// POST { limit?: 100 } — 아직 char_scores 없는 카페부터 limit개씩 처리
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    await loadCriteriaLists(); // 성향축 키워드 사전 캐시 프라임(computeCharScores가 동기 getListSync로 읽음)
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS char_scores JSONB`;
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 300);

    const rows = await sql`
      SELECT id, name, synth_identity, synth_reviews FROM cafes
      WHERE published = true AND char_scores IS NULL
      LIMIT ${limit}` as unknown as any[];

    let updated = 0;
    for (const r of rows) {
      const texts: string[] = [];
      if (r.synth_identity) texts.push(r.synth_identity);
      if (Array.isArray(r.synth_reviews)) r.synth_reviews.forEach((x: any) => x.quote && texts.push(x.quote));
      const scores = computeCharScores(texts, r.name);
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
