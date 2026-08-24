import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";

// 다른 사람들의 '내 카페' 집계 — 카페별 등록 인원수(중복기기 distinct). 본인 제외. 개인정보 0(숫자만).
export async function GET(req: NextRequest) {
  try {
    const device = req.nextUrl.searchParams.get("device") || "";
    // 🔑 2026-08-25(CEO 지시): 미인증 기록은 **작성자 본인 + 관리자**만 볼 수 있다.
    //   일반 사용자에게는 종전대로 verified=true만 집계한다(해자 유지).
    //   관리자는 운영상 전체를 봐야 하므로 관리자 비밀번호가 오면 미인증도 포함한다.
    const isAdmin = req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD
      || req.nextUrl.searchParams.get("admin") === process.env.ADMIN_PASSWORD;
    const rows = isAdmin
      ? await sql`
      SELECT c.id, c.name, c.area, c.lat, c.lng, COUNT(DISTINCT v.device_id)::int cnt
      FROM user_visits v JOIN cafes c ON c.id = v.cafe_id AND c.published = true
      WHERE v.finalized = true AND v.device_id <> ${device} AND c.lat IS NOT NULL
      GROUP BY c.id, c.name, c.area, c.lat, c.lng
      HAVING COUNT(DISTINCT v.device_id) > 0
      ORDER BY cnt DESC LIMIT 1000`
      : await sql`
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
