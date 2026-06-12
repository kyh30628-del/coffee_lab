import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
    await ensureSchema();
    const [r, c, y] = await Promise.all([
      sql`SELECT
        count(*) FILTER (WHERE raw_reviews IS NOT NULL)::int total,
        count(*) FILTER (WHERE llm_judged_at IS NOT NULL)::int judged,
        count(*) FILTER (WHERE raw_reviews IS NOT NULL AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at))::int queue,
        count(*) FILTER (WHERE llm_judged_at::date = CURRENT_DATE)::int today,
        max(llm_judged_at) AS last FROM cafes`,
      sql`SELECT
        count(*)::int total,
        count(*) FILTER (WHERE published)::int pub,
        count(*) FILTER (WHERE raw_reviews IS NULL)::int collect_queue,
        count(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int new_today FROM cafes`,
      sql`SELECT
        count(*) FILTER (WHERE yt_checked_at IS NOT NULL)::int with_yt,
        count(*) FILTER (WHERE yt_checked_at::date = CURRENT_DATE)::int yt_today,
        count(*) FILTER (WHERE yt_checked_at IS NULL AND raw_reviews IS NOT NULL)::int yt_queue,
        max(yt_checked_at) AS yt_last FROM cafes`,
    ]);
    const j = r[0] as any, col = c[0] as any, yt = y[0] as any;
    const done = Math.max(0, (j.total ?? 0) - (j.queue ?? 0));
    const pct = j.total > 0 ? Math.round((done / j.total) * 100) : 0;
    return NextResponse.json({ ok: true,
      total: j.total, judged: j.judged, queue: j.queue, today: j.today, done, pct, last: j.last,
      cafesTotal: col.total, cafesPub: col.pub, collectQueue: col.collect_queue, newToday: col.new_today,
      ytTotal: yt.with_yt, ytToday: yt.yt_today, ytQueue: yt.yt_queue, ytLast: yt.yt_last,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
