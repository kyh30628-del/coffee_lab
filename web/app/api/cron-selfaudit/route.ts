import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { recordRun } from "@/lib/agentLog";
import { autoCorrect } from "@/lib/issues";
import { pushTrigger } from "@/lib/auditTrigger";

export const runtime = "nodejs";

// 🛡️ 상시 자율 진단 에이전트 (결정론 백본) — 매일. 서비스 전체를 스스로 점검 → 자동교정(결정론) →
//   자동으로 못 푸는 중대 이상은 CEO 결재(L3) 자동 상신 + 담당 본부 배정 → selfaudit_runs에 기록.
//   기획조정실장(LLM)이 이 결과를 매일 감시·심화. "대표님이 발견하기 전에 내가 먼저."
//   결정론·무료·멱등. 판단이 필요한 비결정 영역만 사람(CEO/기조실장)에게 올린다.

// 크론별 정상 최대 경과(시간) — 주간/월간 크론을 '지연'으로 오탐하지 않게.
const EXPECT_MAX_H: Record<string, number> = {
  "cron-snapshot": 200, "cron-resynth": 200, "cron-newsletter": 200, "cron-discover-categories": 800,
  "cron-verify": 30, "cron-sentinel": 30, "cron-demand": 30, "cron-rulegap": 30, "cron-closure": 12,
  "cron-grow": 6, "cron-enrich": 8, "cron-embed": 4, "cron-synth": 4, "cron-issues": 2,
};
const maxH = (job: string) => EXPECT_MAX_H[job] ?? 8;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  await sql`CREATE TABLE IF NOT EXISTS selfaudit_runs (
    id SERIAL PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now(),
    ok BOOLEAN, findings JSONB, fixed JSONB, escalated JSONB
  )`.catch(() => {});

  const findings: { check: string; count: number; team: string; critical?: boolean }[] = [];
  const fixed: string[] = [];
  const escalated: string[] = [];
  const one = async (q: any): Promise<number> => Number((await q)[0].c);

  try {
    // ── 1) 자동교정 먼저 (결정론 해결: 비카페·오프콘셉·식당·오염) ──
    const ac = await autoCorrect().catch(() => ({ resolved: 0, escalated: 0, log: [] as string[] }));
    if (ac.resolved) fixed.push(`자동교정 ${ac.resolved}건 — ${ac.log.slice(0, 4).join("; ")}`);
    if (ac.escalated) escalated.push(`오염 비공개 결재상신 ${ac.escalated}건`);

    // ── 2) 데이터 정합성 (자동교정 후에도 남으면 = 비결정·조사필요) ──
    const integ: [string, number, string, boolean][] = [
      ["수도권 박스 밖 발행", await one(sql`SELECT count(*) c FROM cafes WHERE published AND (lat<36.8 OR lat>38.3 OR lng<124.5 OR lng>127.9)`), "품질본부", true],
      ["비수도권 주소 발행", await one(sql`SELECT count(*) c FROM cafes WHERE published AND (address LIKE '충청%' OR address LIKE '강원%' OR address LIKE '전라%' OR address LIKE '경상%' OR address LIKE '대전%' OR address LIKE '부산%' OR address LIKE '대구%' OR address LIKE '울산%' OR address LIKE '광주광역시%' OR address LIKE '세종%' OR address LIKE '제주%')`), "품질본부", true],
      ["근거오염 발행(coherence<0.3)", await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_coherence<0.3 AND COALESCE(offctx_ok,false)=false`), "품질본부", true],
      ["표시필드 결손(좌표·area·identity·grade·빈이름)", await one(sql`SELECT count(*) c FROM cafes WHERE published AND (length(trim(coalesce(name,'')))<1 OR lat IS NULL OR lng IS NULL OR area IS NULL OR area='' OR synth_identity IS NULL OR synth_identity='' OR synth_grade IS NULL)`), "운영본부", true],
      ["폐업의심 지속(closure_misses>=3)", await one(sql`SELECT count(*) c FROM cafes WHERE published AND COALESCE(closure_misses,0)>=3`), "운영본부", false],
    ];
    for (const [name, n, team, crit] of integ) if (n > 0) findings.push({ check: name, count: n, team, critical: crit });

    // ── 3) 제품 라이브(사용자가 실제 보는 것) ──
    for (const ep of ["/", "/api/search?q=커피"]) {
      try {
        const r = await fetch(new URL(ep, req.url).toString(), { cache: "no-store" });
        if (!r.ok) findings.push({ check: `라이브 다운 ${ep} (${r.status})`, count: 1, team: "운영본부", critical: true });
      } catch { findings.push({ check: `라이브 다운 ${ep}`, count: 1, team: "운영본부", critical: true }); }
    }

    // ── 4) 크론·에이전트 건강 ──
    const crons = (await sql`SELECT DISTINCT ON (job) job, ok, ran_at, processed FROM agent_runs ORDER BY job, ran_at DESC`) as any[];
    for (const c of crons) {
      if (!c.ok) findings.push({ check: `크론 실패 ${c.job}`, count: 1, team: "경영지원본부", critical: true });
      const ageH = (Date.now() - new Date(c.ran_at).getTime()) / 3.6e6;
      // ⚠️ 오탐 방지(2026-06-30, 자율진단 에이전트 발견): '정상 실행했는데 할 일 0(휴면)'은 정지가 아님.
      //   dong-backfill('소진·완료')·demand(수요갭0)·sentinel(치유0) 등이 ok·processed=0로 자연 휴면 → '정지의심' 제외.
      const dormantIdle = c.ok && Number(c.processed || 0) === 0;
      if (ageH > maxH(c.job) && !dormantIdle) findings.push({ check: `크론 정지의심 ${c.job} (${Math.round(ageH)}h)`, count: 1, team: "경영지원본부", critical: true });
    }

    // ── 5) 자가검증: CEO 결재가 방치되는지 (실행·피드백 누수 감시) ──
    const staleDec = await one(sql`SELECT count(*) c FROM decisions WHERE status='pending' AND tier='L3' AND created_at < now()-interval '3 days'`).catch(() => 0);
    if (staleDec > 0) findings.push({ check: `CEO 결재 3일+ 방치 ${staleDec}건`, count: staleDec, team: "기획조정실", critical: false });

    // ── 6) 못 푸는 중대건 → CEO 결재(L3) 자동 상신 + 담당 본부 배정 (중복방지) ──
    for (const f of findings.filter((f) => f.critical)) {
      const ik = `selfaudit:${f.check}`.slice(0, 120);
      const dup = (await sql`SELECT 1 FROM decisions WHERE action_params->>'ikey'=${ik} AND status IN('pending','approved') LIMIT 1`.catch(() => [])) as any[];
      if (!dup.length) {
        await sql`INSERT INTO decisions (title, detail, team, severity, tier, action_type, action_params)
          VALUES (${`[자율진단] ${f.check}`.slice(0, 110)},
                  ${`상시 자율진단이 자동교정으로 해소 못 한 중대 이상(${f.count}건). 담당 ${f.team}. 기조실장 1차 조사 → 대표님 판단 필요.`},
                  ${f.team}, 'HIGH', 'L3', 'investigate', ${JSON.stringify({ ikey: ik, check: f.check, count: f.count })}::jsonb)`.catch(() => {});
        escalated.push(f.check);
        // 🔔 자동해결 못한 중대 이상 = 판단 필요 → 이벤트형 트리거. 로컬 watcher가 self-audit LLM을 즉시 깨운다.
        await pushTrigger("selfaudit_critical", f.check, `${f.check} (${f.count}건·${f.team})`, "HIGH");
      }
    }

    const ok = findings.filter((f) => f.critical).length === 0;
    await sql`INSERT INTO selfaudit_runs (ok, findings, fixed, escalated)
      VALUES (${ok}, ${JSON.stringify(findings)}::jsonb, ${JSON.stringify(fixed)}::jsonb, ${JSON.stringify(escalated)}::jsonb)`.catch(() => {});
    await recordRun("cron-selfaudit", true, `점검 ${findings.length}·자동교정 ${fixed.length}·결재상신 ${escalated.length}${ok ? " · 클린" : " · 이상"}`, findings.length);
    return NextResponse.json({ ok, summary: ok ? "클린" : "이상 감지", findings, fixed, escalated }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    await recordRun("cron-selfaudit", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
