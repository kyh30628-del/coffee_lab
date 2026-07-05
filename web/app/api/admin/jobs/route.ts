import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 🛠 로컬 launchd 잡 상태 — agent_runs(하트비트) 기준 실시간. 관제 화면 잡 상태 카드용.
//   정지 판정: 마지막 기록이 maxH(주기+버퍼) 초과면 stale. maxH는 lib/jobTeams.ts EXPECT_MAX_H와 일치시킬 것.
//   ⚠️ 제거된 잡(qualityaudit·dong-backfill .disabled)은 여기 넣지 말 것 — 하트비트 행이 없어 '미기록=오류'로 오표시됨(2026-07-02 수정).
const JOB_META: Record<string, { label: string; team: string; sched: string; maxH: number }> = {
  "chief-manager":     { label: "일간 사이클",      team: "기획조정실",   sched: "08·12·17시",        maxH: 20 },
  "self-audit":        { label: "자율진단",         team: "기획조정실",   sched: "11:30·15:30·21:30", maxH: 16 },
  "audit-watch":       { label: "이벤트 워처",      team: "기획조정실",   sched: "5분",              maxH: 1 },
  "dev-pipeline":      { label: "개발 파이프라인",  team: "기획조정실",   sched: "5분",              maxH: 1 },
  "dev-deploy":        { label: "배포 워커",        team: "기획조정실",   sched: "2분",              maxH: 1 },
  "youtube-backfill":  { label: "유튜브 수집",      team: "품질본부",     sched: "16:30",            maxH: 30 },
  "weekly-evaluation": { label: "주간 거버넌스",    team: "전략기획본부", sched: "10:30(격일)",       maxH: 30 },
  "chat-watch":        { label: "관제 챗봇",        team: "경영지원본부", sched: "상주",             maxH: 1 },
};

export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const keys = Object.keys(JOB_META);
    const rows = (await sql`SELECT job, ok, detail, ran_at FROM agent_runs WHERE job = ANY(${keys})`) as any[];
    const byJob = new Map(rows.map((r) => [r.job, r]));
    const now = Date.now();
    const jobs = keys.map((k) => {
      const meta = JOB_META[k];
      const r = byJob.get(k);
      if (!r) return { job: k, ...meta, state: "미기록", ok: false, stale: true, ageMin: null, detail: "" };
      const ageMin = Math.round((now - new Date(r.ran_at).getTime()) / 60000);
      const stale = ageMin > meta.maxH * 60;
      const state = !r.ok ? "실패" : stale ? "정지의심" : "정상";
      return { job: k, ...meta, state, ok: r.ok, stale, ageMin, detail: String(r.detail || "").slice(0, 60) };
    });
    // 문제 잡 먼저(실패>정지>정상)
    jobs.sort((a, b) => (a.state === "정상" ? 1 : 0) - (b.state === "정상" ? 1 : 0) || (a.ok ? 1 : 0) - (b.ok ? 1 : 0));
    const bad = jobs.filter((j) => j.state !== "정상").length;

    // 🕐 오늘의 핵심 운영 사이클(chief-manager 08·12·17시) 각각 돌았는지 — "12시 배치 돌았나?"를 한눈에.
    //   상태: ran(실행됨·시각) / pending(아직 예정) / missing(지날 시간인데 누락=문제).
    const KST = 9 * 3600 * 1000;
    const nowKst = new Date(now + KST);
    const todayKst = nowKst.toISOString().slice(0, 10);
    const nowHourK = nowKst.getUTCHours() + nowKst.getUTCMinutes() / 60;
    // ⚠️ 사이클 실행 이름이 둘: 아침 풀사이클=chief-manager-agent, 점심/오후=chief-manager. 둘 다 세야 아침이 오탐 '누락' 안 뜸.
    const cmRuns = (await sql`SELECT ran_at FROM agent_runs WHERE job IN ('chief-manager','chief-manager-agent') AND (ran_at AT TIME ZONE 'Asia/Seoul')::date = ${todayKst}::date ORDER BY ran_at`) as any[];
    const hourOf = (t: any) => { const k = new Date(new Date(t).getTime() + KST); return { h: k.getUTCHours() + k.getUTCMinutes() / 60, hh: String(k.getUTCHours()).padStart(2, "0"), mm: String(k.getUTCMinutes()).padStart(2, "0") }; };
    const CYCLE_DEF = [{ name: "아침", label: "08시", hour: 8, lo: 6, hi: 10.5 }, { name: "점심", label: "12시", hour: 12, lo: 10.5, hi: 14.5 }, { name: "오후", label: "17시", hour: 17, lo: 14.5, hi: 20.5 }];
    const cycles = CYCLE_DEF.map((c) => {
      const hit = cmRuns.map(hourOf).find((k) => k.h >= c.lo && k.h < c.hi);
      if (hit) return { name: c.name, label: c.label, state: "ran", at: `${hit.hh}:${hit.mm}` };
      if (nowHourK < c.hour) return { name: c.name, label: c.label, state: "pending", at: null };
      return { name: c.name, label: c.label, state: "missing", at: null };
    });

    return NextResponse.json({ ok: true, jobs, bad, cycles, total: jobs.length, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { headers: { "Cache-Control": "no-store" } });
  }
}
