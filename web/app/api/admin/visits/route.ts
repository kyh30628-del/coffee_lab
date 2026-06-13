import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";
const authed = (req: NextRequest) => req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const rows = await sql`
      SELECT v.id, c.name AS cafe_name, c.area, v.device_id, v.photo_url, v.memory, v.favorite, v.created_at
      FROM user_visits v JOIN cafes c ON c.id = v.cafe_id
      WHERE v.verified = true
      ORDER BY v.created_at DESC LIMIT 200`;
    const [stat] = await sql`SELECT count(*)::int total, count(DISTINCT device_id)::int users, count(*) FILTER(WHERE favorite)::int favs FROM user_visits WHERE verified=true` as any[];
    return NextResponse.json({ ok: true, visits: rows, stat });
  } catch (e) { return NextResponse.json({ ok: true, visits: [], stat: null }); }
}
