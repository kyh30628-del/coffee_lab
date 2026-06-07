import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { synthAndStore } from "@/lib/synthStore";

export const runtime = "nodejs";
export const maxDuration = 60;

const synthOne = synthAndStore;

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_grade TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_identity TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_basis TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_count INT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_acidity REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_body REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_sweet REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_updated TIMESTAMPTZ`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_reviews JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS char_scores JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_quality JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS review_dates JSONB`;

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 50);

    const targets = await sql`
      SELECT id, name, area FROM cafes
      ORDER BY synth_updated ASC NULLS FIRST LIMIT ${limit}
    ` as unknown as { id: number; name: string; area: string }[];

    const results = [];
    for (const cafe of targets) {
      try { results.push(await synthOne(cafe)); }
      catch (e) { results.push({ id: cafe.id, name: cafe.name, ok: false, reason: String(e) }); }
      await new Promise((r) => setTimeout(r, 400));
    }
    const okN = results.filter((r) => r.ok).length;
    return NextResponse.json({ ok: true, processed: results.length, success: okN, failed: results.length - okN, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  try {
    await ensureSchema();
    const rows = await sql`SELECT name, area, synth_grade, synth_count, synth_updated FROM cafes WHERE published = true ORDER BY synth_updated ASC NULLS FIRST`;
    return NextResponse.json({ ok: true, cafes: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
