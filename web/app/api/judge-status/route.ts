import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 🧮 AI 판정 진행 현황 — 관리자 모니터링. (어디까지 판정 반영됐는지)
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
    await ensureSchema();
    const r = (await sql`SELECT
      count(*) FILTER (WHERE raw_reviews IS NOT NULL)::int total,
      count(*) FILTER (WHERE llm_judged_at IS NOT NULL)::int judged,
      count(*) FILTER (WHERE raw_reviews IS NOT NULL AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at))::int queue,
      count(*) FILTER (WHERE llm_judged_at::date = CURRENT_DATE)::int today,
      max(llm_judged_at) AS last
      FROM cafes`)[0] as any;
    const done = Math.max(0, (r.total ?? 0) - (r.queue ?? 0));
    const pct = r.total > 0 ? Math.round((done / r.total) * 100) : 0;
    return NextResponse.json({ ok: true, total: r.total, judged: r.judged, queue: r.queue, today: r.today, done, pct, last: r.last });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
