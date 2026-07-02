import { NextRequest, NextResponse } from "next/server";
import { recordRun } from "@/lib/agentLog";
import { consumeCoordination } from "@/lib/coordConsumer";

export const runtime = "nodejs";

// 🤝 협업 요청 소비기 크론(결재 #114) — 열린 협업을 트리아지→집행/상신/라우팅→회신→종결.
//   🛡️ 롤아웃 1단계=드라이런(집행 0). live 집행은 ?mode=live 명시할 때만 — Vercel 크론은 파라미터 없이
//      호출하므로 배포돼도 기본 드라이런(안전). 관찰 후 vercel.json에 ?mode=live 추가(명시 배포)로 승격.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const dryRun = new URL(req.url).searchParams.get("mode") !== "live";
  try {
    const { handled, skippedHuman, total, report } = await consumeCoordination({ dryRun });
    await recordRun("cron-coord-consumer", true, report.split("\n")[0].slice(0, 180), handled.length);
    return NextResponse.json({ ok: true, dryRun, total, handled, skippedHuman, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    await recordRun("cron-coord-consumer", false, String(e).slice(0, 180), 0).catch(() => {});
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
