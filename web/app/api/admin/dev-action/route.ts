import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 🚀 개발 결재 2차 게이트 — 개발 에이전트가 브랜치에 구현·검증(배포대기)한 뒤, CEO가 배포/폐기 확정.
//   deploy: dev_status='deploy_approved' → 로컬 배포 워커가 merge+push(=배포). discard: 반려·브랜치 폐기.
//   서버는 코드 배포 못 함(ToS·구조) → 상태만 바꾸고 실제 배포는 로컬 dev-deploy가 수행.
export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const { id, action } = await req.json();
    const d = (await sql`SELECT * FROM decisions WHERE id=${id} AND action_type='dev_task'`)[0] as any;
    if (!d) return NextResponse.json({ ok: false, error: "없는 개발 결재" }, { status: 404 });
    const ds = d.action_params?.dev_status;
    if (action === "deploy") {
      if (ds !== "배포대기") return NextResponse.json({ ok: false, error: `배포대기 상태가 아님(현재: ${ds || "미빌드"})` }, { status: 400 });
      await sql`UPDATE decisions SET action_params = action_params || '{"dev_status":"deploy_approved"}'::jsonb, result='CEO 배포 확정 — 배포 진행' WHERE id=${id}`;
      return NextResponse.json({ ok: true, status: "deploy_approved" });
    }
    if (action === "discard") {
      await sql`UPDATE decisions SET status='rejected', decided_at=now(), decided_by='CEO', result='CEO 폐기', action_params = action_params || '{"dev_status":"discarded"}'::jsonb WHERE id=${id}`;
      // 연결 협업 '종결'(status=resolved) — stage만 바꾸면 open 좀비로 남아 카운트 부풀림+지연 재상신됨(#65 사례).
      if (d.action_params?.coord) await sql`UPDATE coordination SET status='resolved', resolved_at=now(), stage='보류(폐기)', resolution=COALESCE(resolution,'')||' [dev_task 폐기 → 종결]' WHERE id=${Number(d.action_params.coord)}`.catch(() => {});
      return NextResponse.json({ ok: true, status: "discarded" });
    }
    return NextResponse.json({ ok: false, error: "action은 deploy|discard" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
