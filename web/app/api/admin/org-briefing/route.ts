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
    // 10일치 전부(하루 여러 건 시간별 구분), 최신순. 하루에 여러 번 생성되면 각각 시각으로 구분해 남긴다.
    await sql`ALTER TABLE org_briefings ADD COLUMN IF NOT EXISTS work_order TEXT`.catch(() => {});
    await sql`ALTER TABLE org_briefings ADD COLUMN IF NOT EXISTS meeting TEXT`.catch(() => {});
    const briefs = await sql`SELECT id,
        to_char(created_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS day,
        to_char(created_at AT TIME ZONE 'Asia/Seoul','HH24:MI') AS time,
        created_at, executive_md, approvals, token_today, crons, metrics, work_order, meeting
      FROM org_briefings
      WHERE created_at > now() - interval '10 days'
      ORDER BY created_at DESC
      LIMIT 80` as any[];
    // brief = 최신 — 상단 토큰·크론·수치 카드용(하위호환).
    return NextResponse.json({ ok: true, brief: briefs[0] ?? null, briefs }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
