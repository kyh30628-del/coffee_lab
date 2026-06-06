import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
    const rows = await sql`SELECT synth_reviews FROM cafes WHERE id=${id} LIMIT 1`;
    const reviews = rows[0]?.synth_reviews ?? [];
    return NextResponse.json({ ok: true, reviews });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
