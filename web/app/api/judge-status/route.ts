import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { judgeQueueCount, dailyCounts } from "@/lib/metrics";
export const runtime = "nodejs";

const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
    await ensureSchema();
    // 판정대기·오늘 지표는 lib/metrics 단일출처 사용(관제탑과 동일 정의 — 화면별 숫자 어긋남 방지).
    const [r, c, y, queue, daily] = await Promise.all([
      sql`SELECT
        count(*) FILTER (WHERE raw_reviews IS NOT NULL)::int total,
        count(*) FILTER (WHERE llm_judged_at IS NOT NULL)::int judged,
        max(llm_judged_at) AS last FROM cafes`,
      sql`SELECT
        count(*)::int total,
        count(*) FILTER (WHERE published)::int pub,
        count(*) FILTER (WHERE raw_reviews IS NULL)::int collect_queue FROM cafes`,
      sql`SELECT
        count(*) FILTER (WHERE yt_checked_at IS NOT NULL)::int with_yt,
        count(*) FILTER (WHERE yt_checked_at IS NULL AND raw_reviews IS NOT NULL)::int yt_queue,
        max(yt_checked_at) AS yt_last FROM cafes`,
      judgeQueueCount(),
      dailyCounts(),
    ]);
    const j = r[0] as any, col = c[0] as any, yt = y[0] as any;
    const done = Math.max(0, (j.total ?? 0) - queue);
    const pct = j.total > 0 ? Math.round((done / j.total) * 100) : 0;
    return NextResponse.json({ ok: true,
      total: j.total, judged: j.judged, queue, today: daily.judged, done, pct, last: j.last,
      cafesTotal: col.total, cafesPub: col.pub, collectQueue: col.collect_queue, newToday: daily.newCafes,
      ytTotal: yt.with_yt, ytToday: daily.yt, ytQueue: yt.yt_queue, ytLast: yt.yt_last,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
