import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureSchema();
    const cafes = await sql`
      SELECT * FROM cafes
      WHERE published = true
      ORDER BY (note IS NOT NULL AND note <> '') DESC, synth_count DESC NULLS LAST, created_at DESC
    `;
    return NextResponse.json({ ok: true, cafes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), cafes: [] }, { status: 500 });
  }
}
