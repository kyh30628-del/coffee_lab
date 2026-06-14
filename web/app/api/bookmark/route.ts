import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";

// 카페 북마크(즐겨찾기) — 내 카페 등록과 별개. 익명 기기기반, 개인정보 0. 위치인증·메모 불필요.
async function ensure() {
  await sql`CREATE TABLE IF NOT EXISTS bookmarks (
    id SERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    cafe_id INT REFERENCES cafes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(device_id, cafe_id)
  )`;
}

// GET ?device= : 내 북마크 카페 목록(상세 표시용)
export async function GET(req: NextRequest) {
  await ensure();
  const device = req.nextUrl.searchParams.get("device") || "";
  if (!device) return NextResponse.json({ ok: true, ids: [], cafes: [] });
  const rows = await sql`
    SELECT c.id, c.name, c.area, c.lat, c.lng, c.synth_grade, c.synth_count, b.created_at
    FROM bookmarks b JOIN cafes c ON c.id = b.cafe_id
    WHERE b.device_id = ${device}
    ORDER BY b.created_at DESC`;
  return NextResponse.json({ ok: true, ids: rows.map((r: any) => r.id), cafes: rows });
}

// POST {device, cafeId, action: add|remove|toggle}
export async function POST(req: NextRequest) {
  try {
    await ensure();
    const { device, cafeId, action = "toggle" } = await req.json();
    if (!device || !cafeId) return NextResponse.json({ ok: false, error: "필수값 누락" }, { status: 400 });
    const [ex] = await sql`SELECT 1 FROM bookmarks WHERE device_id=${device} AND cafe_id=${cafeId} LIMIT 1` as any[];
    let bookmarked: boolean;
    if (action === "add" || (action === "toggle" && !ex)) {
      await sql`INSERT INTO bookmarks (device_id, cafe_id) VALUES (${device}, ${cafeId}) ON CONFLICT DO NOTHING`;
      bookmarked = true;
    } else {
      await sql`DELETE FROM bookmarks WHERE device_id=${device} AND cafe_id=${cafeId}`;
      bookmarked = false;
    }
    return NextResponse.json({ ok: true, bookmarked });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
