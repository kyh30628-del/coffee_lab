import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureSchema();
    const total = await sql`SELECT COUNT(*)::int AS n FROM cafes`;
    const byPub = await sql`SELECT published, COUNT(*)::int AS n FROM cafes GROUP BY published`;
    const bySource = await sql`SELECT source, COUNT(*)::int AS n FROM cafes GROUP BY source ORDER BY n DESC`;
    const synthed = await sql`SELECT COUNT(*)::int AS n FROM cafes WHERE synth_updated IS NOT NULL`;
    const needSynth = await sql`SELECT COUNT(*)::int AS n FROM cafes WHERE synth_updated IS NULL`;
    const byArea = await sql`SELECT area, COUNT(*)::int AS n FROM cafes GROUP BY area ORDER BY n DESC LIMIT 30`;
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
