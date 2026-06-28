import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 🔔 결재 항목 — 자율 조직이 올린 '구조화된 의사결정'. CEO가 모바일에서 승인→실행.
//   action_type: unpublish | downgrade | restore | requeue_resynth | agent_task(기조실장 배분)
async function ensure() {
  await sql`CREATE TABLE IF NOT EXISTS decisions (
    id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now(),
    title TEXT, detail TEXT, team TEXT, severity TEXT,
    action_type TEXT, action_params JSONB,
    status TEXT DEFAULT 'pending', decided_at TIMESTAMPTZ, result TEXT
  )`.catch(() => {});
}

export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    await ensure();
    const pending = await sql`SELECT id,title,detail,team,severity,action_type,action_params FROM decisions WHERE status='pending' ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MED' THEN 1 ELSE 2 END, created_at DESC` as any[];
    const recent = await sql`SELECT id,title,status,result,to_char(decided_at,'MM-DD HH24:MI') decided FROM decisions WHERE status<>'pending' ORDER BY decided_at DESC LIMIT 8` as any[];
    return NextResponse.json({ ok: true, pending, recent }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
