import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { recordRun } from "@/lib/agentLog";
import { runCriteriaChecks, ensureCriteriaVerifyTable } from "@/lib/criteriaVerify";
export const runtime = "nodejs";
export const maxDuration = 60;

// 🛡️ 기준 검증 에이전트 v1 (품질본부 · 결정론) — 비즈니스 기준(criteria)이 코드에 제대로 적용돼 있는지 주기 검증.
//   dead-knob·범위드리프트·시드드리프트·실효과 어긋남을 잡아 criteria_verify_reports에 적재 + 관제탑 표면화.
//   ⚠️ lib/issues.ts 동결영역 미접촉. 하드 FAIL(dead-knob·범위이탈)만 recordRun(ok=false)로 기존 cronfail 이슈경로 재사용(신규 자동경로 없음).
const authed = (req: NextRequest) => {
  const pw = req.headers.get("x-admin-password");
  if (pw && pw === process.env.ADMIN_PASSWORD) return true;
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  return !!secret && auth === `Bearer ${secret}`;
};

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureCriteriaVerifyTable();
    const report = await runCriteriaChecks();

    // 관리자 화면 실시간 조회(latest=1) — 스냅샷 대신 매번 재산출(stale 표시 방지, cron-verify와 동일 방침). DB 미기록.
    if (req.nextUrl.searchParams.get("latest")) {
      return NextResponse.json({ ok: true, report });
    }

    await sql`INSERT INTO criteria_verify_reports (status, fails, warns, dead_knobs, checks)
      VALUES (${report.status}, ${report.fails}, ${report.warns}, ${report.deadKnobs.join(",")}, ${JSON.stringify(report.checks)})`;
    await sql`DELETE FROM criteria_verify_reports WHERE id NOT IN (SELECT id FROM criteria_verify_reports ORDER BY ran_at DESC LIMIT 60)`;

    // 하트비트 + 에스컬레이션. status='fail'(dead-knob·범위이탈=무결성 위반)일 때만 ok=false로 기존 cronfail 경로 점화(품질본부 자동배정·자율진단 트리거).
    //   warn(프록시 실효과)은 ok=true — 빨강 금지(CLAUDE.md §3), 관제탑 카드로만 노란 표면화.
    const hardFail = report.status === "fail";
    const detail = hardFail
      ? `dead-knob/드리프트 ${report.fails}건${report.deadKnobs.length ? ` [${report.deadKnobs.join(",")}]` : ""}`
      : `pass(warn ${report.warns})`;
    await recordRun("cron-criteria-verify", !hardFail, detail, report.fails + report.warns);

    return NextResponse.json({ ok: true, report });
  } catch (e) {
    await recordRun("cron-criteria-verify", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
