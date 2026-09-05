import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 공개 카페명 자동완성 — 사장님 등록 시 '기존 카페 보완' 선택용(이름·지역만).
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 1) return NextResponse.json({ ok: true, cafes: [] });
    const rows = await sql`SELECT id, name, area FROM cafes WHERE name ILIKE ${"%" + q + "%"} ORDER BY synth_count DESC NULLS LAST LIMIT 8`;
    return NextResponse.json({ ok: true, cafes: rows }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
