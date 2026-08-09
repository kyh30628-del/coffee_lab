import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 🛠 개발 파이프라인 현황 — 승인된 dev_task의 진행상태(개발대기/배포대기/실패/배포중). 배포대기·실패는 CEO 조치 필요.
//   pending(미승인)은 일반 결재 섹션에서 승인. 여긴 승인 이후 흐름만.
// ⏱ 배포정체 감시(#280, 감지·알림 전용 — dev_status 자동전환·결재/이슈 생성 없음, lib/issues.ts 미접촉):
//   '배포대기'로 STUCK_MIN분 이상 머문 건을 표면화. source≠'chat'(자율진단·크론발) 집계는 별도 유지 —
//   #370로 chat-watch.mjs 자동승격이 source 무관 처리로 고쳐졌지만(dev_autodeploy='false' 명시일 때만 제외),
//   주간한도 pause 등으로 여전히 정체될 수 있어 감시는 남겨둔다(memory: dev-status-promotion-gap, #270/#370 사례).
//   age는 dev_claimed(구현 시작 시각, 없으면 created_at)로부터의 경과 — 정확한 '배포대기 진입 시각' 컬럼이 없어 근사치.
const STUCK_MIN = 30;
export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const rows = (await sql`SELECT id, title, result,
        COALESCE(action_params->>'dev_status','개발대기') dev_status,
        action_params->>'branch' branch, action_params->>'summary' summary,
        action_params->>'source' source,
        round(extract(epoch from (now() - COALESCE((action_params->>'dev_claimed')::timestamptz, created_at))) / 60)::int age_min
      FROM decisions
      WHERE action_type='dev_task' AND status='approved'
      ORDER BY (COALESCE(action_params->>'dev_status','')='배포대기') DESC, id DESC`) as any[];
    for (const r of rows) r.stuck = r.dev_status === "배포대기" && r.age_min >= STUCK_MIN;
    const waiting = rows.filter((r) => r.dev_status === "배포대기").length;
    const stuck = rows.filter((r) => r.stuck);
    const stuckNonChat = stuck.filter((r) => r.source !== "chat");
    return NextResponse.json({
      ok: true, jobs: rows, waiting,
      stuckCount: stuck.length, stuckNonChatCount: stuckNonChat.length,
      stuck: stuck.map((r) => ({ id: r.id, title: r.title, age_min: r.age_min, source: r.source || null })),
      // 🔔 즉시발화 설정 여부(불리언만 — 토픽값은 절대 노출 안 함). 미설정이면 승인해도 다음 창(08/12/16/20시)까지 대기한다.
      //   2026-08-09: 이 값이 프로덕션에서 false인 걸 아무도 모른 채 4일 지나 배포가 매번 최대 4h 밀렸다.
      //   설정 절차가 사람 손이면 반드시 **시스템이 스스로 설정 상태를 보고**해야 한다(조용한 실패 금지).
      triggerConfigured: !!process.env.TRIGGER_NTFY_TOPIC,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { headers: { "Cache-Control": "no-store" } });
  }
}
