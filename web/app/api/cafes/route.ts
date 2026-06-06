import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 지도·목록용 경량 응답 — 무거운 synth_reviews는 제외(상세 열 때 따로 로드)
export async function GET() {
  try {
    await ensureSchema();
    const cafes = await sql`
      SELECT id, name, area, lat, lng, vibe, note, signature,
             synth_grade, synth_count, synth_identity,
             acidity, body, sweet, roasts_own, uses, tone, photo_url, hours, phone
      FROM cafes
      WHERE published = true
      ORDER BY (note IS NOT NULL AND note <> '') DESC, synth_count DESC NULLS LAST
    `;
    return NextResponse.json({ ok: true, cafes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), cafes: [] }, { status: 500 });
  }
}
