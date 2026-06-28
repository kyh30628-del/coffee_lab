import { NextRequest, NextResponse } from "next/server";
import { syncIssues } from "@/lib/issues";

export const runtime = "nodejs";

// 🚨 실시간 이슈 — 대시보드 로드마다 즉시 탐지·라우팅(RM 분류·기조실장 명의)·반환.
//   관제탑 어디서든 문제가 잡히면 바로 issues에 적재되고 담당 본부가 배정된다.
export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const open = await syncIssues();
    return NextResponse.json({ ok: true, open }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
