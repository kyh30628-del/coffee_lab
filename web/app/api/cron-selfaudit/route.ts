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

// 잡별 감시 계약(정상 최대 경과·담당 본부) = lib/jobTeams.ts **단일 출처**(2026-07-02 수리).
//   과거: ①3벌 맵 drift ②제거된 잡(dong-backfill·qualityaudit) 잔존 ③주석과 실제 주기 불일치("self-audit 01시").
import { EXPECT_MAX_H, teamOf } from "@/lib/jobTeams";
import { loadCriteria, getCriterionSync } from "@/lib/criteria";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  await sql`CREATE TABLE IF NOT EXISTS selfaudit_runs (
    id SERIAL PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now(),
    ok BOOLEAN, findings JSONB, fixed JSONB, escalated JSONB
  )`.catch(() => {});

  // ikey?: dedup 안정키(경과시간처럼 매 실행 변하는 값을 check에 넣는 finding이 있어, dedup은 이 안정키로 한다).
  //   미지정 시 check 문자열이 곧 안정키(경과시간 등 가변값이 없는 finding).
  const findings: { check: string; count: number; team: string; critical?: boolean; ikey?: string }[] = [];
  const fixed: string[] = [];
  const escalated: string[] = [];
  const one = async (q: any): Promise<number> => Number((await q)[0].c);

  try {
    // ── 1) 자동교정 먼저 (결정론 해결: 비카페·오프콘셉·식당·오염) ──
    const ac = await autoCorrect().catch(() => ({ resolved: 0, escalated: 0, log: [] as string[] }));
    if (ac.resolved) fixed.push(`자동교정 ${ac.resolved}건 — ${ac.log.slice(0, 4).join("; ")}`);
    if (ac.escalated) escalated.push(`오염 비공개 결재상신 ${ac.escalated}건`);

    // ── 2) 데이터 정합성 (자동교정 후에도 남으면 = 비결정·조사필요) ──
    await loadCriteria(); // 수도권 좌표박스 기준 캐시 프라임(폴백=36.8~38.3/124.5~127.9)
    const latMin = getCriterionSync("geo.box.lat_min"), latMax = getCriterionSync("geo.box.lat_max");
    const lngMin = getCriterionSync("geo.box.lng_min"), lngMax = getCriterionSync("geo.box.lng_max");
    const integ: [string, number, string, boolean][] = [
      ["수도권 박스 밖 발행", await one(sql`SELECT count(*) c FROM cafes WHERE published AND (lat<${latMin} OR lat>${latMax} OR lng<${lngMin} OR lng>${lngMax})`), "품질본부", true],
      ["비수도권 주소 발행", await one(sql`SELECT count(*) c FROM cafes WHERE published AND (address LIKE '충청%' OR address LIKE '강원%' OR address LIKE '전라%' OR address LIKE '경상%' OR address LIKE '대전%' OR address LIKE '부산%' OR address LIKE '대구%' OR address LIKE '울산%' OR address LIKE '광주광역시%' OR address LIKE '세종%' OR address LIKE '제주%')`), "품질본부", true],
      ["근거오염 발행(coherence<0.3)", await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_coherence<0.3 AND COALESCE(offctx_ok,false)=false`), "품질본부", true],
      ["표시필드 결손(좌표·area·identity·grade·빈이름)", await one(sql`SELECT count(*) c FROM cafes WHERE published AND (length(trim(coalesce(name,'')))<1 OR lat IS NULL OR lng IS NULL OR area IS NULL OR area='' OR synth_identity IS NULL OR synth_identity='' OR synth_grade IS NULL)`), "운영본부", true],
      ["폐업의심 지속(closure_misses>=3)", await one(sql`SELECT count(*) c FROM cafes WHERE published AND COALESCE(closure_misses,0)>=3`), "운영본부", false],
      // coord#266: closure_misses=0(네이버 존재는 확인됨)이라도 검증등급 근거 최신후기가 18개월+ 노후 — 폐업조사 사각지대 보조지표.
      //   증거부재≠폐업 원칙상 non-critical(자동 결재상신 없음) — 운영본부 관측·판단용.
      ["검증등급 최신증거 18개월+노후(closure_misses=0 사각)", await one(sql`
        WITH x AS (
          SELECT id, (SELECT max(to_date(d, 'YYYY.MM.DD')) FROM jsonb_array_elements_text(review_dates) d) AS latest
          FROM cafes WHERE published AND synth_grade='검증' AND COALESCE(closure_misses,0)=0
        )
        SELECT count(*) c FROM x WHERE latest < now() - interval '18 months'`), "운영본부", false],
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
    //   🛡️ 2026-07-02 전면 수리: 과거 dormantIdle(ok && processed==0) 면제가 하트비트 잡(항상 processed=0) 전원을
    //   정지감지에서 영구 제외 → "8개 잡 감시망"이 구조적으로 죽어 있었음(7/1 17시 12에이전트 전멸도 무감지).
    //   새 계약: **EXPECT_MAX_H에 등록된 잡만 staleness 감시**(등록=계약, 주기적 잡은 휴면이어도 ran_at이 갱신되므로
    //   오탐 없음). 미등록 잡(일회성 스크립트·제거된 잡 잔류 기록)은 실패(ok=false)만 감지 — 영구 오탐 클래스 차단.
    const crons = (await sql`SELECT DISTINCT ON (job) job, ok, ran_at, processed FROM agent_runs ORDER BY job, ran_at DESC`) as any[];
    for (const c of crons) {
      if (!c.ok) findings.push({ check: `크론 실패 ${c.job}`, count: 1, team: teamOf(c.job), critical: true });
      const expect = EXPECT_MAX_H[c.job];
      if (expect == null) continue; // 감시 계약 없는 잡은 staleness 미적용
      const ageH = (Date.now() - new Date(c.ran_at).getTime()) / 3.6e6;
      // ⚠️ ikey에서 경과시간(Math.round(ageH))을 분리한다 — 시간은 title/detail(=check 표시)에만, dedup은 잡 이름 안정키로.
      //   과거: check 전체(경과시간 포함)를 ikey로 써서 매 사이클 ikey가 달라져 dedup 미매치 → 좀비 결재 row 누적(#264/#265).
      if (ageH > expect) findings.push({ check: `크론 정지의심 ${c.job} (${Math.round(ageH)}h)`, count: 1, team: teamOf(c.job), critical: true, ikey: `selfaudit:크론정지의심:${c.job}` });
    }

    // ── 5) 자가검증: CEO 결재가 방치되는지 (실행·피드백 누수 감시) ──
    const staleDec = await one(sql`SELECT count(*) c FROM decisions WHERE status='pending' AND tier='L3' AND created_at < now()-interval '3 days'`).catch(() => 0);
    if (staleDec > 0) findings.push({ check: `CEO 결재 3일+ 방치 ${staleDec}건`, count: staleDec, team: "기획조정실", critical: false });

    // ── 6) 못 푸는 중대건 → CEO 결재(L3) 자동 상신 + 담당 본부 배정 (중복방지) ──
    for (const f of findings.filter((f) => f.critical)) {
      const ik = (f.ikey ?? `selfaudit:${f.check}`).slice(0, 120);
      const dup = (await sql`SELECT 1 FROM decisions WHERE action_params->>'ikey'=${ik} AND status IN('pending','approved') LIMIT 1`.catch(() => [])) as any[];
      if (!dup.length) {
        await sql`INSERT INTO decisions (title, detail, team, severity, tier, action_type, action_params, recommendation)
          VALUES (${`[자율진단] ${f.check}`.slice(0, 110)},
                  ${`상시 자율진단이 자동교정으로 해소 못 한 중대 이상(${f.count}건). 담당 ${f.team}. 기조실장 1차 조사 → 대표님 판단 필요.`},
                  ${f.team}, 'HIGH', 'L3', 'investigate', ${JSON.stringify({ ikey: ik, check: f.check, count: f.count })}::jsonb,
                  ${`결정론 자동교정이 못 푼 중대 이상이라 ${f.team} 조사·조치가 필요합니다. 승인 시 해당 본부에 배정합니다.`})`.catch(() => {});
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
