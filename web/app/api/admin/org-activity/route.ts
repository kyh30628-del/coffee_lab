import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { JOB_TEAM } from "@/lib/jobTeams";
export const runtime = "nodejs";

// 🏛️ 본부별 활동 현황(관리자) — 각 본부가 마지막으로 언제 일했는지 + 다음 현업 사이클(08·12·17시 KST).
//   "조직이 조용하지 않다"를 한눈에. agent_runs(잡별 최신)를 JOB_TEAM으로 본부 그룹핑.
const authed = (req: NextRequest) =>
  !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

// 현업 본부 사이클 시각(KST). 조간회의 폐지 후 08·12(점심 신규)·17 3회.
const CYCLES = [8, 12, 17];
const TEAM_ORDER = ["품질본부", "성장본부", "운영본부", "경험본부", "영업본부", "전략기획본부", "경영지원본부", "기획조정실"];

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const runs = (await sql`SELECT DISTINCT ON (job) job, ok, ran_at, EXTRACT(EPOCH FROM (now()-ran_at))/3600 h
      FROM agent_runs ORDER BY job, ran_at DESC`) as unknown as { job: string; ok: boolean; ran_at: string; h: number }[];

    const byTeam: Record<string, { team: string; lastH: number; lastJob: string; ok: boolean; jobs: number; ran24h: number }> = {};
    for (const r of runs) {
      const t = JOB_TEAM[r.job] ?? "경영지원본부";
      const cur = byTeam[t] ?? (byTeam[t] = { team: t, lastH: Infinity, lastJob: "", ok: true, jobs: 0, ran24h: 0 });
      cur.jobs++;
      if (+r.h < 24) cur.ran24h++;
      if (+r.h < cur.lastH) { cur.lastH = +r.h; cur.lastJob = r.job; cur.ok = r.ok; }
    }
    const teams = TEAM_ORDER.filter((t) => byTeam[t]).map((t) => ({ ...byTeam[t], lastH: Math.round(byTeam[t].lastH * 10) / 10 }));

    // 다음 현업 사이클(KST)
    const nowKstMin = Math.floor(Date.now() / 60000) + 9 * 60;
    const minOfDay = ((nowKstMin % 1440) + 1440) % 1440;
    let nextCycleMin = CYCLES.map((h) => h * 60).find((m) => m > minOfDay);
    const nextIsToday = nextCycleMin != null;
    if (nextCycleMin == null) nextCycleMin = CYCLES[0] * 60 + 1440; // 내일 첫 사이클
    const minsToNext = nextCycleMin - minOfDay;

    return NextResponse.json({
      ok: true,
      teams,
      totalRan24h: runs.filter((r) => +r.h < 24).length,
      cycles: CYCLES,
      nextCycleHour: (nextCycleMin % 1440) / 60,
      nextCycleToday: nextIsToday,
      minsToNext,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
