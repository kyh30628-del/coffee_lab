import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 🛠 개발 파이프라인 현황 — 승인된 dev_task의 진행상태(개발대기/배포대기/실패/배포중). 배포대기·실패는 CEO 조치 필요.
//   pending(미승인)은 일반 결재 섹션에서 승인. 여긴 승인 이후 흐름만.
export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const rows = (await sql`SELECT id, title, result,
        COALESCE(action_params->>'dev_status','개발대기') dev_status,
        action_params->>'branch' branch, action_params->>'summary' summary
      FROM decisions
      WHERE action_type='dev_task' AND status='approved'
      ORDER BY (COALESCE(action_params->>'dev_status','')='배포대기') DESC, id DESC`) as any[];
    const waiting = rows.filter((r) => r.dev_status === "배포대기").length;
    return NextResponse.json({ ok: true, jobs: rows, waiting }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { headers: { "Cache-Control": "no-store" } });
  }
}
