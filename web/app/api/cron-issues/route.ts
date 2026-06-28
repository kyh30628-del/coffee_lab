import { NextRequest, NextResponse } from "next/server";
import { syncIssues } from "@/lib/issues";
import { recordRun } from "@/lib/agentLog";

export const runtime = "nodejs";

// 🚨 실시간 이슈 파수꾼 — 아무도 안 봐도 주기적으로 탐지·라우팅해 issues를 최신화(개통/해소 추적).
//   대시보드 로드(=/api/admin/issues)와 같은 엔진. 결정론·토큰0.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const open = await syncIssues();
    const high = open.filter((i: any) => i.severity === "HIGH").length;
    await recordRun("cron-issues", true, `열린 이슈 ${open.length}(HIGH ${high}) — RM 자동분류·본부 배정`, open.length);
    return NextResponse.json({ ok: true, count: open.length, high, open });
  } catch (e) {
    await recordRun("cron-issues", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
