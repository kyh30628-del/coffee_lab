import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { synthAndStore } from "@/lib/synthStore";
import { PRIORITY_AREAS } from "@/lib/discover";
import { recordRun } from "@/lib/agentLog";
import { autoCorrect } from "@/lib/issues";
import { isCostHalted } from "@/lib/costGuard";
export const runtime = "nodejs";
export const maxDuration = 300; // 신규 큐를 시간예산껏 비움

// 🏭 신규 합성 전용 크론 — 공격적 발굴이 합성을 압도(발굴 회차당 수백 vs cron-grow 합성 5)하면서
//   신규(new) 큐가 적체됨. 이 크론이 미합성 카페를 시간예산 내에서 대량 처리한다.
//   워크플로우 불변: synthAndStore가 raw 수집 → 옥석 합성(규칙) → 품질 게이트 통과 시에만 공개.
//   토큰 미사용(네이버 수집 + 규칙 합성). LLM 보조판정은 별도 cron-batch-judge(Batches).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    await ensureSchema();
    if (await isCostHalted()) { await recordRun("cron-synth", true, "🛑 비용 자동정지 중 — 스킵", 0).catch(() => {}); return NextResponse.json({ ok: true, skipped: "cost-halt" }); }
    const BUDGET_MS = 280_000; // maxDuration 300초 내 안전 여유
    const t0 = Date.now();
    let processed = 0, published = 0, skipped = 0, failed = 0;
    // 미합성 우선(신규), 가장 오래된 순. 시간예산까지 배치로 순회.
    while (Date.now() - t0 < BUDGET_MS) {
      const batch = (await sql`SELECT id, name, area FROM cafes WHERE synth_updated IS NULL ORDER BY (area = ANY(${PRIORITY_AREAS})) DESC, created_at ASC NULLS FIRST LIMIT 8`) as unknown as { id: number; name: string; area: string }[];
      if (!batch.length) break;
      for (const cafe of batch) {
        if (Date.now() - t0 >= BUDGET_MS) break;
        try {
          const r: any = await synthAndStore(cafe); // refresh 미지정 → raw 없으면 수집, 있으면 재사용
          processed++;
          if (r?.published) published++;
          if (r?.skipped) skipped++;
        } catch { failed++; }
        await new Promise((r) => setTimeout(r, 350));
      }
    }
    const pendingNew = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE synth_updated IS NULL`)[0].n;
    // 🔄 합성 직후 즉시 정리 — 새로 공개된 데이터에 비카페·오염·정합성 문제가 있으면 그 자리에서 해결(10분 폴링 안 기다림).
    const ac = await autoCorrect().catch(() => ({ resolved: 0, escalated: 0, log: [] as string[] }));
    await recordRun("cron-synth", true, `합성 ${processed} 공개 ${published} 실패 ${failed} 신규대기 ${pendingNew}${ac.resolved ? ` · 즉시정리 ${ac.resolved}` : ""}`, processed);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), processed, published, skipped, failed, pendingNew, autoCorrect: ac });
  } catch (e) {
    await recordRun("cron-synth", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
