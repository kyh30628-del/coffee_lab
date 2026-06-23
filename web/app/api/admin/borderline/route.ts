import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 🤖 LLM 보강 대기 — 공개 중이나 '경계후기'(노출엔 제외)가 있어 LLM 판정을 기다리는 카페.
//   규칙으로 깨끗한 후기만 노출 중(소비자 신뢰 유지) + 경계후기는 크레딧 복구 시 LLM이 평가→확인분만 보강.
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS borderline_count INT`.catch(() => {});
    const [s] = await sql`SELECT
      COUNT(*) FILTER (WHERE published AND COALESCE(borderline_count,0) > 0 AND llm_judged_at IS NULL)::int cafes,
      COALESCE(SUM(borderline_count) FILTER (WHERE published AND COALESCE(borderline_count,0) > 0 AND llm_judged_at IS NULL), 0)::int reviews
      FROM cafes` as any[];
    const list = await sql`
      SELECT id, name, area, COALESCE(synth_count,0)::int shown, COALESCE(borderline_count,0)::int borderline, synth_grade
      FROM cafes
      WHERE published AND COALESCE(borderline_count,0) > 0 AND llm_judged_at IS NULL
      ORDER BY borderline_count DESC LIMIT 200` as any[];
    return NextResponse.json({ ok: true, summary: { cafes: s.cafes, reviews: s.reviews }, list });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
