import { NextRequest, NextResponse } from "next/server";
import { syncIssues, autoCorrect } from "@/lib/issues";
import { loadCriteria } from "@/lib/criteria";

export const runtime = "nodejs";

// 🚨 실시간 이슈 — 대시보드 로드마다 즉시 자동교정(오탐 정리·오염 결재상신) → 탐지·라우팅 → 반환.
//   관제탑 어디서든 문제가 잡히면 무인 교정 후, 남은 것만 담당 본부 배정으로 띄운다.
export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    await loadCriteria(); // 좌표박스 기준(geo.box.*) 캐시 프라임 — integ:outbox가 현재 criteria값을 보게(폴백=DEFAULTS)
    const ac = await autoCorrect().catch(() => ({ resolved: 0, escalated: 0, log: [] as string[] }));
    const open = await syncIssues();
    return NextResponse.json({ ok: true, open, autoCorrect: ac }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
