import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 지도·목록용 경량 응답 — 무거운 synth_reviews는 제외(상세 열 때 따로 로드)
export async function GET() {
  try {
    await ensureSchema();
    const cafes = await sql`
      SELECT c.id, c.name, c.area, c.lat, c.lng, c.vibe, c.note, c.signature,
             c.synth_grade, c.synth_count, c.synth_identity,
             c.acidity, c.body, c.sweet, c.roasts_own, c.uses, c.tone, c.photo_url, c.hours, c.phone, c.char_scores,
             COALESCE(p.featured AND p.approved AND (p.featured_until IS NULL OR p.featured_until > now()), false) AS featured
      FROM cafes c
      LEFT JOIN cafe_promos p ON p.cafe_id = c.id
      WHERE c.published = true
      ORDER BY (c.note IS NOT NULL AND c.note <> '') DESC, c.synth_count DESC NULLS LAST
    `;
    return NextResponse.json({ ok: true, cafes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), cafes: [] }, { status: 500 });
  }
}
