import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";
const authed = (req: NextRequest) => req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    // 관리자 대시보드는 인증/미인증 전체를 상태 컬럼(verified)과 함께 조회
    const rows = await sql`
      -- 🔑 2026-08-25: 관리자는 **미인증 포함 전부**를 본다(CEO 지시: 미인증은 본인+관리자만 열람).
      --   사진도 photo_url 1장만 보내 5장짜리 기록이 1장으로 보이던 것 → photos 배열까지 함께 보낸다.
      SELECT v.id, v.cafe_id, c.name AS cafe_name, c.area, v.device_id, v.photo_url, v.photos, v.memory,
             v.favorite, v.verified, v.finalized, v.is_public, v.created_at
      FROM user_visits v JOIN cafes c ON c.id = v.cafe_id
      ORDER BY v.created_at DESC LIMIT 200`;
    const [stat] = await sql`SELECT count(*)::int total, count(DISTINCT device_id)::int users, count(*) FILTER(WHERE favorite)::int favs,
      count(*) FILTER(WHERE verified)::int verified, count(*) FILTER(WHERE NOT verified)::int unverified FROM user_visits` as any[];

    // ⭐ 2026-08-25(CEO 지적): 관리자 화면에 **찜(bookmarks)이 아예 없었다.**
    //   기존 '즐겨찾기' 표시는 전부 user_visits.favorite(추억 속 하트, 실사용 0건)였고,
    //   카페 상세·지도에서 누른 진짜 찜 9건은 관리자 어디에서도 볼 수 없었다.
    //   새 API를 만들지 않고 이 응답에 함께 실어 보낸다(요청 1회 유지).
    const marks = await sql`
      SELECT b.id, b.cafe_id, c.name AS cafe_name, c.area, c.synth_grade, c.published,
             b.device_id, b.anon_id, b.created_at
      FROM bookmarks b LEFT JOIN cafes c ON c.id = b.cafe_id
      ORDER BY b.created_at DESC LIMIT 200`;
    const [mstat] = await sql`SELECT count(*)::int total, count(DISTINCT device_id)::int users,
      count(*) FILTER (WHERE created_at > now()-interval '7 days')::int last7 FROM bookmarks` as any[];

    return NextResponse.json({ ok: true, visits: rows, stat, marks, mstat });
  } catch (e) { return NextResponse.json({ ok: true, visits: [], stat: null }); }
}
