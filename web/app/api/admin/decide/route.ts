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
      // 개발 결재 반려 → 연결된 협업 보류 표시(재상신 안 되게)
      if (d.action_type === "dev_task" && d.action_params?.coord)
        await sql`UPDATE coordination SET stage='보류(CEO반려)' WHERE id=${Number(d.action_params.coord)}`.catch(() => {});
      // 정체판단 반려 → 연결 협업 폐기 종결(더는 재촉 안 함 = 좀비 종료)
      if (d.action_type === "route_coord" && d.action_params?.coord)
        await sql`UPDATE coordination SET status='resolved', resolved_at=now(), stage='폐기(CEO반려)', resolution=COALESCE(resolution,'')||' [CEO 정체판단 반려 → 폐기 종결]' WHERE id=${Number(d.action_params.coord)}`.catch(() => {});
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
        case "dev_task": {
          // 개발(코드 변경·배포) 승인 → 개발 실행 대기 큐로. 연결 협업 stage=개발승인. 실제 개발은 개발 실행 경로가 처리.
          status = "approved"; result = "CEO 승인 — 개발 착수 대기(코드 작성→검증→배포)";
          if (p.coord) await sql`UPDATE coordination SET stage='개발승인' WHERE id=${Number(p.coord)}`.catch(() => {});
          break;
        }
        case "route_coord": {
          // 정체 협업 조치판단 승인 → 기조실장이 실제 조치항목(dev_task·비공개·검색제한)으로 재배정. 협업은 소유 이관(좀비 종료).
          status = "approved"; result = "CEO 승인 — 기획조정실장 재배정 대기(실제 조치항목으로 전환)";
          if (p.coord) await sql`UPDATE coordination SET stage='기조실장 재배정', to_team='기획조정실' WHERE id=${Number(p.coord)}`.catch(() => {});
          break;
        }
        default:
          status = "approved"; result = "승인 기록(수동 실행 필요)";
      }
      if (["unpublish", "downgrade", "restore", "requeue_resynth"].includes(d.action_type)) await sql`DELETE FROM search_cache`.catch(() => {});
    } catch (e) {
      status = "failed"; result = "실행 오류: " + String(e).slice(0, 80);
    }
    await sql`UPDATE decisions SET status=${status}, decided_at=now(), result=${result}, decided_by='CEO' WHERE id=${id}`;
    return NextResponse.json({ ok: true, status, result, affected });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
