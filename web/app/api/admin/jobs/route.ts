import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 🛠 로컬 launchd 잡 상태 — agent_runs(하트비트) 기준 실시간. 관제 화면 잡 상태 카드용.
//   정지 판정: 마지막 기록이 maxH(주기+버퍼) 초과면 stale. maxH는 lib/jobTeams.ts EXPECT_MAX_H와 일치시킬 것.
//   ⚠️ 제거된 잡(qualityaudit·dong-backfill .disabled)은 여기 넣지 말 것 — 하트비트 행이 없어 '미기록=오류'로 오표시됨(2026-07-02 수정).
const JOB_META: Record<string, { label: string; team: string; sched: string; maxH: number }> = {
  "chief-manager":     { label: "일간 사이클",      team: "기획조정실",   sched: "08·17시",          maxH: 20 },
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
    return NextResponse.json({ ok: true, jobs, bad, total: jobs.length, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { headers: { "Cache-Control": "no-store" } });
  }
}
