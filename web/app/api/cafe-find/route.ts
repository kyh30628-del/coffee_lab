import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // 관리자 전용(사장님 분석 검색): 비밀번호 필요
    if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    await ensureSchema();
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const rows = await sql`
      SELECT id, name, area, published, synth_grade, synth_count, lat, lng, char_scores
      FROM cafes WHERE name ILIKE ${"%" + q + "%"} LIMIT 20`;
    return NextResponse.json({ ok: true, count: rows.length, rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
