import { NextRequest, NextResponse } from "next/server";
import { syncIssues, autoCorrect } from "@/lib/issues";
import { recordRun } from "@/lib/agentLog";

export const runtime = "nodejs";

// 🚨 실시간 이슈 파수꾼 — 아무도 안 봐도 주기적으로 탐지·라우팅해 issues를 최신화(개통/해소 추적).
//   대시보드 로드(=/api/admin/issues)와 같은 엔진. 결정론·토큰0.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    // 관제탑(orchestrator_state)을 먼저 갱신 → RM 미러가 stale 신호(이미 끝난 '규칙갭 승인대기' 등)를 안 보게.
    //   읽기전용 GET이라 토큰0·비파괴. 실패해도 마지막 상태로 graceful.
    try { await fetch(new URL("/api/orchestrator", req.url).toString(), { cache: "no-store" }); } catch { /* graceful */ }
    // 🔧 자동 교정 먼저 — 오탐 정리·진짜 오염 결재 상신(무인). 그 다음 남은 것만 이슈로 띄움.
    const ac = await autoCorrect().catch(() => ({ resolved: 0, escalated: 0, log: [] as string[] }));
    const open = await syncIssues();
    const high = open.filter((i: any) => i.severity === "HIGH").length;
    await recordRun("cron-issues", true, `자동교정 정리 ${ac.resolved}·결재상신 ${ac.escalated} / 열린 이슈 ${open.length}(HIGH ${high})`, open.length);
    return NextResponse.json({ ok: true, count: open.length, high, autoCorrect: ac, open });
  } catch (e) {
    await recordRun("cron-issues", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
