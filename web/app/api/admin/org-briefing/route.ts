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
    // 일자별 최신 1건 × 7일(최신순). 하루에 여러 번 생성돼도 그날 마지막 보고서만.
    const briefs = await sql`SELECT DISTINCT ON ((created_at AT TIME ZONE 'Asia/Seoul')::date)
        to_char((created_at AT TIME ZONE 'Asia/Seoul')::date,'YYYY-MM-DD') AS day, created_at, executive_md, approvals, token_today, crons, metrics
      FROM org_briefings
      ORDER BY (created_at AT TIME ZONE 'Asia/Seoul')::date DESC, created_at DESC
      LIMIT 7` as any[];
    // brief = 오늘(최신) — 상단 토큰·크론·수치 카드용(하위호환).
    return NextResponse.json({ ok: true, brief: briefs[0] ?? null, briefs }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
