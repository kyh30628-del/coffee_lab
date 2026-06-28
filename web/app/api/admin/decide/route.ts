import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// CEO 결재 실행 — 승인 시 안전·결정론 액션은 즉시 서버 실행, 코드/에이전트 필요건은 '승인'으로 기조실장 배분 대기.
export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const { id, decision } = await req.json();
    const d = (await sql`SELECT * FROM decisions WHERE id=${id} AND status='pending'`)[0] as any;
    if (!d) return NextResponse.json({ ok: false, error: "이미 처리됐거나 없는 결재" }, { status: 404 });

    if (decision === "reject") {
      await sql`UPDATE decisions SET status='rejected', decided_at=now(), result='CEO 반려' WHERE id=${id}`;
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // 승인 → action_type별 실행
    const p = d.action_params || {};
    const ids: number[] = Array.isArray(p.ids) ? p.ids.map(Number) : [];
    let result = "", status = "done", affected = 0;
    try {
      switch (d.action_type) {
        case "unpublish": {
          const r = await sql`UPDATE cafes SET published=false, pipeline_status='excluded', updated_at=now() WHERE id=ANY(${ids}) RETURNING id`;
          affected = r.length; result = `비공개·제외 ${affected}곳`; break;
        }
        case "downgrade": {
          const r = await sql`UPDATE cafes SET synth_grade='참고', updated_at=now() WHERE id=ANY(${ids}) AND synth_grade='검증' RETURNING id`;
          affected = r.length; result = `검증→참고 ${affected}곳`; break;
        }
        case "restore": {
          const r = await sql`UPDATE cafes SET published=true, pipeline_status='live', closure_misses=0, updated_at=now() WHERE id=ANY(${ids}) RETURNING id`;
          affected = r.length; result = `복원 ${affected}곳`; break;
        }
        case "requeue_resynth": {
          const r = await sql`UPDATE cafes SET synth_updated=NULL, updated_at=now() WHERE id=ANY(${ids}) RETURNING id`;
          affected = r.length; result = `재합성 큐 ${affected}곳`; break;
        }
        case "agent_task": {
          // 코드·에이전트 필요 → 서버 즉시 실행 불가. 승인만 기록, 기조실장이 배분.
          status = "approved"; result = `승인됨 — 기획조정실장이 ${d.team || "담당 본부"}에 배분·실행 예정`; break;
        }
        default:
          status = "approved"; result = "승인 기록(수동 실행 필요)";
      }
      if (["unpublish", "downgrade", "restore", "requeue_resynth"].includes(d.action_type)) await sql`DELETE FROM search_cache`.catch(() => {});
    } catch (e) {
      status = "failed"; result = "실행 오류: " + String(e).slice(0, 80);
    }
    await sql`UPDATE decisions SET status=${status}, decided_at=now(), result=${result} WHERE id=${id}`;
    return NextResponse.json({ ok: true, status, result, affected });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
