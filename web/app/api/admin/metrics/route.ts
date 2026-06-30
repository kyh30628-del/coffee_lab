import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 📊 상단 카드용 라이브 메트릭 — 브리핑(08/17 시점) 대신 *지금* 값. 20초마다 페이지가 폴링.
export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    // 단일 쿼리(Neon 부하·500 위험 최소화)
    const c = (await sql`SELECT
      count(*) FILTER (WHERE published)::int pub,
      count(*) FILTER (WHERE published AND synth_grade='검증')::int v,
      count(*) FILTER (WHERE synth_updated IS NULL)::int backlog
      FROM cafes`)[0] as any;
    let cronOk = 0, cronTotal = 0, cronFail: string[] = [];
    try {
      const crons = (await sql`SELECT job, ok FROM (SELECT DISTINCT ON (job) job, ok, ran_at FROM agent_runs ORDER BY job, ran_at DESC) t`) as any[];
      cronTotal = crons.length; cronOk = crons.filter((x) => x.ok).length; cronFail = crons.filter((x) => !x.ok).map((x) => x.job);
    } catch { /* graceful */ }
    return NextResponse.json({ ok: true, pub: c.pub, v: c.v, backlog: c.backlog, cronOk, cronTotal, cronFail, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // 500 안 내고 graceful — 일시적 DB 오류면 페이지가 직전값 유지
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { headers: { "Cache-Control": "no-store" } });
  }
}
