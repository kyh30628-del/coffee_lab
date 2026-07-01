import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 🤝 협업 현황 — 경영지원팀 주관 코디네이션 보드(본부·팀 간 도움·인계·코웍·의존).
export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    await sql`CREATE TABLE IF NOT EXISTS coordination (id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now(), from_team TEXT, to_team TEXT, type TEXT, topic TEXT, detail TEXT, status TEXT DEFAULT 'open', resolved_at TIMESTAMPTZ, resolution TEXT)`.catch(() => {});
    const open = await sql`SELECT id,from_team,to_team,type,topic,detail,status,
        COALESCE(stage, '요청') stage,
        CASE WHEN due_at IS NULL THEN NULL ELSE round(EXTRACT(EPOCH FROM (due_at-now()))/3600) END due_h,
        EXTRACT(EPOCH FROM (now()-created_at))/86400 days
      FROM coordination WHERE status IN ('open','in_progress')
      ORDER BY (COALESCE(stage,'')='지연') DESC, created_at ASC` as any[];
    const resolved = await sql`SELECT id,from_team,to_team,topic,resolution,to_char(resolved_at,'MM-DD') d FROM coordination WHERE status='resolved' ORDER BY resolved_at DESC LIMIT 5` as any[];
    const overdue = (open as any[]).filter((c) => c.stage === "지연").length;
    return NextResponse.json({ ok: true, open, resolved, overdue }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
