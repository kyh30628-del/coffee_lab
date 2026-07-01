import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// ✅ '실행 중'(승인된 실무형) 결재를 사람이 '완료' 처리 — 실세계 일(현장 방문·B2B 미팅 등)은
//    자동 종결 신호가 없어 수동 완료가 필요하다. 없으면 끝난 일이 영구 '실행중' 좀비로 남는다(#59 사례).
//    데이터 조작이 없는 상태 전환(L2 이하)이라 즉시 처리.
export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const { id } = await req.json();
    const r = await sql`UPDATE decisions SET status='done', decided_at=now(),
        result = COALESCE(result,'') || ' [완료 처리]'
      WHERE id=${Number(id)} AND status='approved'
        AND action_type IN ('agent_task','investigate','route_coord')
      RETURNING id` as any[];
    if (!r.length) return NextResponse.json({ ok: false, error: "완료 가능한 '실행 중' 항목이 아님(승인된 실무형만)" }, { status: 404 });
    return NextResponse.json({ ok: true, status: "done" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
