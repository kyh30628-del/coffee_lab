import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { META, ensureCriteriaTable } from "@/lib/criteria";
import { runCriteriaChecks } from "@/lib/criteriaVerify";
export const runtime = "nodejs";

// 🎛️ 기준 관제 상태 요약 — /admin/org 관제탑 상태카드용(경량). 현 스냅샷·최근변경·검증에이전트 결과.
//   실시간 재산출(stale 방지). DB 미기록(기록은 cron-criteria-verify가 담당).
export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    await ensureCriteriaTable();
    const rows = (await sql`SELECT key, value, default_value FROM criteria`) as { key: string; value: number; default_value: number }[];
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const adjusted = META.filter((m) => { const r = byKey.get(m.key); return r && Number(r.value) !== m.def; }).length;

    const [last] = (await sql`SELECT key, old_value, new_value, changed_by, changed_at, impact_note FROM criteria_history ORDER BY changed_at DESC LIMIT 1`) as any[];

    const report = await runCriteriaChecks();
    const failing = report.checks.filter((c) => c.severity === "fail" && c.count > 0);
    const warning = report.checks.filter((c) => c.severity === "warn" && c.count > 0);

    return NextResponse.json({
      ok: true,
      total: META.length,
      adjusted,
      lastChange: last ?? null,
      verify: {
        status: report.status,
        fails: report.fails,
        warns: report.warns,
        deadKnobs: report.deadKnobs,
        scanned: report.scanned,
        ranAt: report.ranAt,
        failing: failing.map((c) => ({ label: c.label, count: c.count, samples: c.samples.slice(0, 4) })),
        warning: warning.map((c) => ({ label: c.label, count: c.count })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
