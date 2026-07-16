import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureSchema();
    // ⚡ 6개 독립 집계를 병렬(6 왕복→1). 서로 입력 의존 0 → 결과 동일.
    const [total, byPub, bySource, synthed, needSynth, byArea] = await Promise.all([
      sql`SELECT COUNT(*)::int AS n FROM cafes`,
      sql`SELECT published, COUNT(*)::int AS n FROM cafes GROUP BY published`,
      sql`SELECT source, COUNT(*)::int AS n FROM cafes GROUP BY source ORDER BY n DESC`,
      sql`SELECT COUNT(*)::int AS n FROM cafes WHERE synth_updated IS NOT NULL`,
      sql`SELECT COUNT(*)::int AS n FROM cafes WHERE synth_updated IS NULL`,
      sql`SELECT area, COUNT(*)::int AS n FROM cafes GROUP BY area ORDER BY n DESC LIMIT 30`,
    ]);
    return NextResponse.json({
      ok: true,
      total: total[0].n,
      published: byPub,
      bySource,
      synthed: synthed[0].n,
      needSynth: needSynth[0].n,
      byArea,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
