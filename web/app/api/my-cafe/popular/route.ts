import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";

// 다른 사람들의 '내 카페' 집계 — 카페별 등록 인원수(중복기기 distinct). 본인 제외. 개인정보 0(숫자만).
export async function GET(req: NextRequest) {
  try {
    const device = req.nextUrl.searchParams.get("device") || "";
    const rows = await sql`
      SELECT c.id, c.name, c.area, c.lat, c.lng, COUNT(DISTINCT v.device_id)::int cnt
      FROM user_visits v JOIN cafes c ON c.id = v.cafe_id AND c.published = true -- 감사수리: 비공개 카페가 방문집계 핀으로 노출되던 누수 차단
      WHERE v.verified = true AND v.finalized = true
        AND v.device_id <> ${device}
        AND c.lat IS NOT NULL
      GROUP BY c.id, c.name, c.area, c.lat, c.lng
      HAVING COUNT(DISTINCT v.device_id) > 0
      ORDER BY cnt DESC
      LIMIT 1000`;
    return NextResponse.json({ ok: true, pins: rows }, { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), pins: [] }, { status: 500 });
  }
}
