import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 🎩 조직 관제 브리핑 — 로컬 자율 조직(기획조정실)이 매일 DB에 올린 EXECUTIVE·결재·토큰·크론을 모바일 관리자화면에 제공.
//   기존 카페-데이터 관제탑과 별개. x-admin-password 인증(동일).
export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    await sql`CREATE TABLE IF NOT EXISTS org_briefings (id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now(), executive_md TEXT, approvals JSONB, token_today JSONB, crons JSONB, metrics JSONB)`.catch(() => {});
    const r = await sql`SELECT created_at, executive_md, approvals, token_today, crons, metrics FROM org_briefings ORDER BY created_at DESC LIMIT 1` as any[];
    return NextResponse.json({ ok: true, brief: r[0] ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
