import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { recordRun } from "@/lib/agentLog";
import { runRecheckTrigger } from "@/lib/recheckTrigger";
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

    // 🔴 2026-09-18 수리 — 예전엔 status='fail'일 때 ok=false를 찍어 기존 cronfail 이슈경로를 빌려 썼다.
    //   새 이슈 유형을 안 만들려던 절약이었는데, 결과는 **크론은 멀쩡한데 화면엔 "cron-criteria-verify 실패"**였다.
    //   진짜 크론 실패(500·타임아웃)와 구분이 안 되고, 정작 무엇이 어긋났는지는 안 보인다.
    //   실제로 그 탓에 09-17 전국 개방의 좌표박스 드리프트(lat_min 33.1이 범위 밖이라 무시되던 건)가
    //   "크론 실패"로만 떠 있었다 — 제주가 이틀간 공개 불가였는데 아무도 그렇게 읽지 못했다.
    //   → 실행이 됐으면 ok=true. 탐지 결과는 lib/issues.ts가 '기준 드리프트'라는 제 이름으로 띄운다
    //     (cron-costwatch를 09-15에 같은 방식으로 고쳤다 — 같은 버그 클래스의 마지막 잔여분).
    const hardFail = report.status === "fail";
    const detail = hardFail
      ? `dead-knob/드리프트 ${report.fails}건${report.deadKnobs.length ? ` [${report.deadKnobs.join(",")}]` : ""}`
      : `pass(warn ${report.warns})`;
    // ♻️ 하네스 L6 — 기준(criteria)이 바뀌었으면 **그 소유 크론이** 소급 재판정 큐를 채운다.
    //   기준 관제의 주인이 품질본부/검증심사팀이므로 여기가 제자리다. 정책 변경이 없으면 쿼리 0회로 끝난다.
    //   🔴 자동 재공개 없음 — '사람이 볼 목록'까지만 만든다.
    const rq = await runRecheckTrigger(26).catch(() => ({ policyChanged: false, scanned: 0, queued: 0, ref: "" }));
    const rqNote = rq.policyChanged ? ` · ♻️소급재판정 대상 ${rq.queued}곳 적재(스캔 ${rq.scanned})` : "";
    await recordRun("cron-criteria-verify", true, detail + rqNote, report.fails + report.warns);

    return NextResponse.json({ ok: true, report });
  } catch (e) {
    await recordRun("cron-criteria-verify", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
