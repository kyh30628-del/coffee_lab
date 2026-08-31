import { NextRequest, NextResponse } from "next/server";
import { noteSilentFail } from "@/lib/silentFail";
import { sql } from "@/lib/db";
import { pingDevTrigger } from "@/lib/devTrigger";

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
      // ① 승인 상태를 **먼저** 확정한다 — 아래 발화가 실패해도 CEO의 승인 자체는 남아야 한다.
      await sql`UPDATE decisions SET action_params = action_params
          || jsonb_build_object('dev_status','deploy_approved','deploy_at', now()::text)
        WHERE id=${id}`;
      const fired = await pingDevTrigger("deploy"); // 로컬 dev-deploy 즉시 발화(브라우저 승인도 대기 없이)
      // ② 🔔 종이 울렸는지 **사실대로** 남긴다(2026-08-31 수리).
      //   예전엔 발화 성공 여부와 무관하게 result='CEO 배포 확정 — 배포 진행'을 박았다. 그래서
      //   TRIGGER_NTFY_TOPIC이 Vercel에 없어 종이 안 울린 9시간 동안도 화면은 "배포 진행 중"이었다.
      //   진행 중인 게 없는데 진행 중이라고 말하는 화면이 장애보다 나쁘다 — 사람이 손쓸 기회를 뺏는다.
      //   (같은 자리에서 2026-08-09에도 4일 죽었다. 그때 남긴 교훈이 화면까지 오지 않았던 것.)
      const msg = fired === "sent"
        ? "CEO 배포 확정 — 로컬 배포 워커 발화됨"
        : `CEO 배포 확정 — 🔴 즉시발화 실패(${fired}) · 다음 정시(08·12·16·20시)까지 대기`;
      await sql`UPDATE decisions SET action_params = action_params || jsonb_build_object('deploy_fired', ${fired}::text),
        result=${msg} WHERE id=${id}`;
      return NextResponse.json({ ok: true, status: "deploy_approved", fired });
    }
    if (action === "discard") {
      await sql`UPDATE decisions SET status='rejected', decided_at=now(), decided_by='CEO', result='CEO 폐기', action_params = action_params || '{"dev_status":"discarded"}'::jsonb WHERE id=${id}`;
      // 연결 협업 '종결'(status=resolved) — stage만 바꾸면 open 좀비로 남아 카운트 부풀림+지연 재상신됨(#65 사례).
      if (d.action_params?.coord) await sql`UPDATE coordination SET status='resolved', resolved_at=now(), stage='보류(폐기)', resolution=COALESCE(resolution,'')||' [dev_task 폐기 → 종결]' WHERE id=${Number(d.action_params.coord)}`.catch((e) => noteSilentFail("devAction.coord.discard", e));
      return NextResponse.json({ ok: true, status: "discarded" });
    }
    return NextResponse.json({ ok: false, error: "action은 deploy|discard" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
