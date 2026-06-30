import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 📊 상단 카드용 라이브 메트릭 — 브리핑(08/17 시점) 대신 *지금* 값. 20초마다 페이지가 폴링.
export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const one = async (q: any) => { try { return Number((await q)[0].c); } catch { return 0; } };
  try {
    const pub = await one(sql`SELECT count(*) c FROM cafes WHERE published`);
    const v = await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_grade='검증'`);
    const backlog = await one(sql`SELECT count(*) c FROM cafes WHERE synth_updated IS NULL`);
    let cronOk = 0, cronTotal = 0, cronFail: string[] = [];
    try {
      const crons = (await sql`SELECT job, ok FROM (SELECT DISTINCT ON (job) job, ok, ran_at FROM agent_runs ORDER BY job, ran_at DESC) t`) as any[];
      cronTotal = crons.length; cronOk = crons.filter((c) => c.ok).length; cronFail = crons.filter((c) => !c.ok).map((c) => c.job);
    } catch { /* graceful */ }
    return NextResponse.json({ ok: true, pub, v, backlog, cronOk, cronTotal, cronFail, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
  }
}
