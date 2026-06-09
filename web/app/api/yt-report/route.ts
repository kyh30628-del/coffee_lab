import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 📺 유튜브 수집 현황 — 매일 어떤 카페에 어떤 유튜브 영상이 수집됐는지(쿼터 한도라 더디게 진행).
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
    await ensureSchema();
    // 최근 30일 내 유튜브 근거가 들어간 카페(확인일=yt_checked_at 기준), 영상 목록 포함
    const rows = await sql`
      SELECT c.id, c.name, c.area, c.yt_checked_at,
        (SELECT json_agg(json_build_object('q', left(r->>'quote', 60), 'l', r->>'link', 's', r->>'source'))
         FROM jsonb_array_elements(c.synth_reviews) r WHERE r->>'link' ILIKE '%youtu%') AS videos
      FROM cafes c
      WHERE c.yt_checked_at IS NOT NULL AND c.yt_checked_at > now() - interval '30 days'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.synth_reviews) r WHERE r->>'link' ILIKE '%youtu%')
      ORDER BY c.yt_checked_at DESC LIMIT 100` as unknown as any[];
    const stat = (await sql`SELECT
      (SELECT count(DISTINCT c.id) FROM cafes c, jsonb_array_elements(c.synth_reviews) r WHERE r->>'link' ILIKE '%youtu%')::int withyt,
      (SELECT count(*) FROM cafes WHERE raw_reviews IS NOT NULL AND yt_checked_at IS NULL)::int remaining,
      (SELECT count(*) FROM cafes WHERE yt_checked_at::date = CURRENT_DATE)::int checked_today`)[0] as any;
    return NextResponse.json({ ok: true, rows, withYt: stat.withyt, remaining: stat.remaining, checkedToday: stat.checked_today });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
