import { NextRequest, NextResponse } from "next/server";
import { sql , ensureOnce } from "@/lib/db";
export const runtime = "nodejs";

// 공개 방문 후기 — 사용자가 '공개'로 등록한 위치인증 방문기록을 카페 상세에 노출(재활용).
//   익명(device_id 비노출). 30m 위치 인증을 거친 진짜 방문이라 신뢰도 높음.
export async function GET(req: NextRequest) {
  const isAdmin = req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
  try {
    const cafeId = Number(req.nextUrl.searchParams.get("cafeId"));
    if (!cafeId) return NextResponse.json({ ok: false, error: "cafeId 필요" }, { status: 400 });
    await ensureOnce("cafe-reviews.user_visits.is_public", async () => {
      await sql`ALTER TABLE user_visits ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false`;
    }).catch(() => {});
    const rows = await sql`
      SELECT memory, photos, photo_url, favorite, created_at
      FROM user_visits
      -- 🔑 관리자는 미인증도 본다(2026-08-25 CEO 지시). 일반 사용자 노출 기준은 그대로.
      WHERE cafe_id = ${cafeId} AND is_public = true AND finalized = true AND (verified = true OR ${isAdmin})
        AND (COALESCE(memory, '') <> '' OR photo_url IS NOT NULL)
      ORDER BY created_at DESC
      LIMIT 30`;
    const reviews = (rows as any[]).map((r) => ({
      memory: r.memory || "",
      photos: Array.isArray(r.photos) && r.photos.length ? r.photos : (r.photo_url ? [r.photo_url] : []),
      favorite: !!r.favorite,
      date: r.created_at,
    }));
    return NextResponse.json({ ok: true, count: reviews.length, reviews }, {
      headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
