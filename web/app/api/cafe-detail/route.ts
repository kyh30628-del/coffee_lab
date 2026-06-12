import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
    const rows = await sql`SELECT synth_reviews, synth_reviews_all, synth_quality, llm_judged_at FROM cafes WHERE id=${id} LIMIT 1`;
    // 전체보기용: synth_reviews_all(옥석 전체) 우선, 없으면 기존 top6
    const reviews = rows[0]?.synth_reviews_all ?? rows[0]?.synth_reviews ?? [];
    const quality = rows[0]?.synth_quality ?? null;
    const llmJudged = !!rows[0]?.llm_judged_at;
    return NextResponse.json({ ok: true, reviews, quality, llmJudged }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
