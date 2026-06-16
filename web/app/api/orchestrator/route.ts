import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { synthAndStore, finalizePipeline, scrubPublishedPII, healGroundingSuspects, holdZeroEvidenceSuspects } from "@/lib/synthStore";
export const runtime = "nodejs";
export const maxDuration = 60;

// 🛰️ 자율 운영 관제탑(Control Tower)
// 각 에이전트가 '만든 실제 데이터'로 가동 여부를 추론(거짓 불가) → 건강 판정 → 적체는 자가 치유 → 멈춤은 경보.
// 토큰 0. 규칙·집계만. ?heal=1 이면 합성 적체를 직접 메움(무료).

type AgentHealth = {
  key: string; label: string; lastRun: string | null; ageH: number | null;
  cadenceH: number; status: "ok" | "behind" | "stalled" | "idle" | "warn";
  queue: number; note: string;
};

const authed = (req: NextRequest) => {
  const pw = req.headers.get("x-admin-password");
  if (pw && pw === process.env.ADMIN_PASSWORD) return true;
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  return (!!secret && auth === `Bearer ${secret}`) || !secret;
};

function ageHours(ts: string | null, now: number): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return isNaN(t) ? null : (now - t) / 3.6e6;
}
// 가동 신선도 → 상태. ok: cadence*1.5내, behind: *3내, stalled: 그 이상
function freshness(ageH: number | null, cadenceH: number): "ok" | "behind" | "stalled" | "idle" {
  if (ageH == null) return "idle";
  if (ageH <= cadenceH * 1.5) return "ok";
  if (ageH <= cadenceH * 3) return "behind";
  return "stalled";
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS orchestrator_state (id INT PRIMARY KEY DEFAULT 1, health JSONB, updated_at TIMESTAMPTZ DEFAULT now())`;
    const now = Date.now();
    // 읽기(현황)는 비민감 → 공개. 자가치유(heal)는 비용 발생 가능 → 인증 필수.
    const heal = req.nextUrl.searchParams.get("heal") === "1" && authed(req);
    const healed: string[] = [];

    // ── 1) 신호 수집(에이전트가 만든 데이터) ──
    const c = (await sql`SELECT
      COUNT(*)::int total,
      COUNT(*) FILTER (WHERE published)::int published,
      COUNT(*) FILTER (WHERE raw_reviews IS NOT NULL)::int raw_cached,
      COUNT(*) FILTER (WHERE llm_judged_at IS NOT NULL)::int judged,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int embedded,
      COUNT(*) FILTER (WHERE published AND embedding IS NOT NULL)::int pub_embedded,
      MAX(raw_collected_at) last_collect,
      MAX(synth_updated) last_synth,
      MAX(llm_judged_at) last_judge,
      MAX(embed_updated) last_embed,
      COUNT(*) FILTER (WHERE raw_reviews IS NOT NULL AND synth_updated IS NULL)::int synth_q,
      COUNT(*) FILTER (WHERE (published OR pipeline_status='pending') AND raw_reviews IS NOT NULL AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at))::int judge_q,
      COUNT(*) FILTER (WHERE embedding IS NULL AND (published OR pipeline_status='pending') AND synth_identity IS NOT NULL)::int embed_q
      FROM cafes`)[0] as any;
    const vr = (await sql`SELECT ran_at, fails, warns, status FROM verify_reports ORDER BY ran_at DESC LIMIT 1`)[0] as any;
    const af = (await sql`SELECT COUNT(*) FILTER (WHERE NOT resolved)::int open, MAX(flagged_at) last_flag FROM audit_flags`)[0] as any;
    await sql`CREATE TABLE IF NOT EXISTS grounding_checks (cafe_id INT PRIMARY KEY, grounded BOOLEAN, issue TEXT, checked_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
    // 그라운딩 의심은 'AI 판정 완료분'만 집계(사장님 기본 규칙). 판정 전 검사는 무효라 제외.
    const gr = (await sql`SELECT COUNT(*) FILTER (WHERE NOT g.grounded)::int suspect, MAX(g.checked_at) last FROM grounding_checks g JOIN cafes c ON c.id = g.cafe_id WHERE c.llm_judged_at IS NOT NULL AND c.llm_judged_at >= c.raw_collected_at`)[0] as any;
    // 그라운딩 백로그(판정완료인데 아직 그라운딩 안 한 공개 카페) + 의심 목록(이름·사유) — 관리자에 명시.
    const grBacklog = (await sql`SELECT COUNT(*)::int n FROM cafes c WHERE c.published AND c.raw_reviews IS NOT NULL AND c.synth_identity IS NOT NULL AND c.llm_judged_at IS NOT NULL AND c.llm_judged_at >= c.raw_collected_at AND NOT EXISTS (SELECT 1 FROM grounding_checks g WHERE g.cafe_id = c.id AND g.checked_at >= c.synth_updated)`.catch(() => [{ n: 0 }]))[0] as any;
    const grSuspects = (await sql`SELECT c.name, c.area, g.issue FROM grounding_checks g JOIN cafes c ON c.id = g.cafe_id WHERE NOT g.grounded AND c.llm_judged_at IS NOT NULL AND c.llm_judged_at >= c.raw_collected_at ORDER BY g.checked_at DESC LIMIT 20`.catch(() => [])) as any[];
    const ds = (await sql`SELECT MIN(last_run) oldest, COUNT(*) FILTER (WHERE last_run < now() - interval '3 days')::int behind, COUNT(*)::int n FROM discovery_state`)[0] as any;
    // 로컬 배치 하트비트 — 실패(크래시 등)·정체를 관제탑이 잡아 경보. (예: dong-backfill ReferenceError)
    await sql`CREATE TABLE IF NOT EXISTS agent_runs (job TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now(), ok BOOLEAN DEFAULT true, detail TEXT, processed INT DEFAULT 0)`.catch(() => {});
    const jobRuns = (await sql`SELECT job, ran_at, to_char(ran_at,'MM-DD HH24:MI') ran, ok, detail, EXTRACT(EPOCH FROM (now()-ran_at))/3600 age_h FROM agent_runs`.catch(() => [])) as any[];
    const jobFails = jobRuns.filter((j) => j.ok === false).map((j) => `${j.job} 오류(${j.ran}): ${(j.detail || "").slice(0, 70)}`);

    // 🔎 공개 데이터 무결성 실시간 자가검증 — 사장님이 잡은 버그 유형을 관제탑이 매번 스스로 검사.
    //   (동 형식·동=구명 오추출·동-구 불일치·카테고리 누락·좌표 오류) 위반 시 즉시 경보.
    const ig = (await sql`SELECT
      COUNT(*) FILTER (WHERE dong IS NOT NULL AND (area=dong||'구' OR area=dong||'시' OR area=dong||'군'))::int dong_isgu,
      COUNT(*) FILTER (WHERE dong IS NOT NULL AND dong !~ '(동|읍|면|가)$')::int dong_badfmt,
      COUNT(*) FILTER (WHERE naver_category IS NULL OR naver_category='')::int pub_nocat,
      COUNT(*) FILTER (WHERE lat IS NULL OR lat NOT BETWEEN 36.8 AND 38.3 OR lng NOT BETWEEN 124.5 AND 127.9)::int pub_badcoord,
      COUNT(*) FILTER (WHERE synth_identity IS NULL OR synth_identity='')::int pub_noidentity
      FROM cafes WHERE published = true`)[0] as any;
    // 결정론적 '진짜 에러'는 검출 즉시 자율 교정(컨펌 불필요). 교정 실패 시에만 integrity 경보로 남김.
    // ⚠️ 자율교정은 '안전·결정론적인 것만' — 단, 비공개로 만드는 조치는 1회 상한(대량삭제 차단). pub_nocat는
    //   기존 검증카페까지 숨겨 인천 사태를 유발 → 자동 비공개에서 제외(카테고리 없음=비카페 아님). 동 교정만 무제한.
    const integrity: string[] = [];
    if (ig.dong_isgu || ig.dong_badfmt || ig.pub_badcoord || ig.pub_noidentity) {
      const fixes: string[] = [];
      try {
        if (ig.dong_isgu) { const r = await sql`UPDATE cafes SET dong=NULL WHERE dong IS NOT NULL AND (area=dong||'구' OR area=dong||'시' OR area=dong||'군') RETURNING 1`; if (r.length) fixes.push(`동=구명 ${r.length}곳 제거`); }
        if (ig.dong_badfmt) { const r = await sql`UPDATE cafes SET dong=NULL WHERE dong IS NOT NULL AND dong !~ '(동|읍|면|가)$' RETURNING 1`; if (r.length) fixes.push(`동형식오류 ${r.length}곳 제거`); }
        // 비공개 조치는 소수일 때만 자동(20건 초과면 대량 의심 → 자동조치 보류하고 경보로 surface)
        if (ig.pub_noidentity > 0 && ig.pub_noidentity <= 20) { const r = await sql`UPDATE cafes SET published=false WHERE published AND (synth_identity IS NULL OR synth_identity='') RETURNING 1`; if (r.length) fixes.push(`정체성없음 ${r.length}곳 비공개`); }
        else if (ig.pub_noidentity > 20) integrity.push(`정체성없음 공개 ${ig.pub_noidentity}곳 — 대량(자동조치 보류, 점검필요)`);
        if (ig.pub_badcoord > 0 && ig.pub_badcoord <= 20) { const r = await sql`UPDATE cafes SET published=false WHERE published AND (lat IS NULL OR lat NOT BETWEEN 36.8 AND 38.3 OR lng NOT BETWEEN 124.5 AND 127.9) RETURNING 1`; if (r.length) fixes.push(`좌표오류 ${r.length}곳 비공개`); }
        else if (ig.pub_badcoord > 20) integrity.push(`좌표오류 공개 ${ig.pub_badcoord}곳 — 대량(자동조치 보류, 점검필요)`);
      } catch (e) { integrity.push(`무결성 자동교정 실패(즉시 확인): ${String(e).slice(0, 50)}`); }
      if (fixes.length) healed.push(`🔧 무결성 자율교정: ${fixes.join(", ")}`);
    }
    if (ig.pub_nocat > 0) integrity.push(`공개인데 카테고리없음 ${ig.pub_nocat}곳(자동조치 안 함 — 백필이 보강)`);
    // 🛑 지역 통째 사라짐 감지 — 카페 30곳+ 지역인데 공개 0 = 대량 비공개 버그(인천 사태). 정상 지역은 항상 일부 공개됨.
    const regionGone = (await sql`SELECT area, COUNT(*)::int tot FROM cafes WHERE area IS NOT NULL GROUP BY area HAVING COUNT(*) >= 30 AND COUNT(*) FILTER (WHERE published) = 0`.catch(() => [])) as any[];
    if (regionGone.length) integrity.push(`⚠️지역 통째 비공개 ${regionGone.length}곳(${regionGone.slice(0, 3).map((r) => r.area).join("·")}) — 대량삭제 의심`);

    // ⚠️ 위험/의심 선제 탐지 — 하드 위반은 아니지만 '문제 발생 소지' 있는 것을 수면 위로 올림(사장님이 보게).
    const risks: string[] = [];
    // (동-구 불일치는 백필이 출처에서 '지번 구=area' 검증으로 예방 → 휴리스틱 노이즈 대신 무결성 dong_isgu가 확정 검출)
    // 오염/환각 의심(그라운딩이 잡은 것)
    if ((gr?.suspect ?? 0) > 0) risks.push(`오염·환각 의심 ${gr.suspect}건(그라운딩 — 재검 대기)`);
    // 3) 발굴 3일+ 지연 지역
    if ((ds?.behind ?? 0) > 0) risks.push(`발굴 3일+ 지연 지역 ${ds.behind}곳`);
    // 4) 미해결 품질 오염 플래그
    if ((af?.open ?? 0) > 0) risks.push(`미해결 오염 플래그 ${af.open}건`);
    // 5) 동 채움 미흡 지역(공개 10곳+인데 동 90% 미만)
    const dgap = (await sql`SELECT COUNT(*)::int n FROM (SELECT area FROM cafes WHERE published GROUP BY area HAVING COUNT(*) >= 10 AND COUNT(*) FILTER (WHERE dong IS NOT NULL)::float / COUNT(*) < 0.9) x`.catch(() => [{ n: 0 }]))[0] as any;
    if (dgap.n > 0) risks.push(`동 채움 미흡 지역 ${dgap.n}곳(<90%)`);
    // 6) 임베딩 미완(의미검색 누락) — 공개인데 임베딩 없는 카페
    const noemb = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published AND embedding IS NULL`.catch(() => [{ n: 0 }]))[0] as any;
    if (noemb.n > 0) risks.push(`의미검색 누락 ${noemb.n}곳(임베딩 대기)`);

    // 파이프라인 진행 상황(신규 카페 조립라인)
    const pl = (await sql`SELECT
      COUNT(*) FILTER (WHERE pipeline_status='new')::int p_new,
      COUNT(*) FILTER (WHERE pipeline_status='pending')::int p_pending,
      COUNT(*) FILTER (WHERE pipeline_status='pending' AND llm_judged_at IS NULL)::int wait_judge,
      COUNT(*) FILTER (WHERE pipeline_status='pending' AND llm_judged_at IS NOT NULL AND embedding IS NULL)::int wait_embed,
      COUNT(*) FILTER (WHERE pipeline_status='pending' AND llm_judged_at IS NOT NULL AND embedding IS NOT NULL)::int ready,
      COUNT(*) FILTER (WHERE pipeline_status='live')::int live,
      COUNT(*) FILTER (WHERE pipeline_status='rejected')::int rejected
      FROM cafes`)[0] as any;

    // 오늘(KST) 수집·진행 현황 + 동 백필 커버리지 — 관리자 '오늘의 수집' 패널용. KST 자정 기준 인라인.
    const td = (await sql`SELECT
      COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')::int new_today,
      COUNT(*) FILTER (WHERE synth_updated >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')::int synth_today,
      COUNT(*) FILTER (WHERE published AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')::int published_today,
      COUNT(*) FILTER (WHERE dong IS NOT NULL)::int has_dong,
      COUNT(*) FILTER (WHERE pipeline_status='noise')::int noise,
      COUNT(*) FILTER (WHERE pipeline_status='new')::int new_q,
      COUNT(*) FILTER (WHERE yt_checked_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')::int yt_today,
      COUNT(*) FILTER (WHERE yt_checked_at IS NOT NULL)::int yt_total
      FROM cafes`)[0] as any;

    // ── 2) 자가 치유 ──
    let promoted = 0;
    if (heal) {
      // (a) 합성 적체(raw 있는데 미합성) 메움 → 신규 'new'가 'pending'으로 진행
      if (c.synth_q > 0) {
        const todo = await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NOT NULL AND synth_updated IS NULL LIMIT 50`;
        let done = 0;
        for (const cf of todo as any[]) { try { await synthAndStore(cf, { refresh: false }); done++; } catch {} }
        if (done) healed.push(`합성 적체 ${done}건 처리`);
      }
      // (b) 풀 게이트 통과한 pending → 자동 공개 승격(finalizer)
      const fin = await finalizePipeline();
      promoted = fin.promoted;
      if (fin.promoted > 0) healed.push(`전 에이전트 통과 ${fin.promoted}곳 자동 공개(${fin.names.slice(0, 3).join(", ")}${fin.promoted > 3 ? " 외" : ""})`);
      // (c) 레드팀 PII 누출 자가치유 — 공개 인용문 전화·이메일·핸들 제거
      try { const pii = await scrubPublishedPII(); if (pii.scrubbed > 0) healed.push(`PII 세척 ${pii.scrubbed}곳(${pii.names.slice(0, 3).join(", ")})`); } catch {}
      // (d) LLM 그라운딩 의심(업체혼동·환각) 자가치유 — 재합성 교정(로컬 그라운딩이 재검사해 플래그 해소)
      try { const gr = await healGroundingSuspects(); if (gr.resynthed > 0) healed.push(`그라운딩 의심 ${gr.resynthed}곳 재합성 교정`); } catch {}
      // (e) 그라운딩 '근거0건' 확정 카페 자동 보류(비공개) + 개선 시 복귀
      try { const z = await holdZeroEvidenceSuspects(); if (z.held > 0) healed.push(`근거0건 ${z.held}곳 자동 비공개(${z.names.slice(0, 3).join(", ")})`); if (z.released > 0) healed.push(`복원 ${z.released}곳`); } catch {}
    }

    // ── 3) 에이전트별 건강 판정 ──
    const agents: AgentHealth[] = [];
    const add = (key: string, label: string, last: string | null, cadenceH: number, queue: number, note = "") => {
      const ageH = ageHours(last, now);
      let status: AgentHealth["status"] = freshness(ageH, cadenceH);
      agents.push({ key, label, lastRun: last, ageH: ageH == null ? null : Math.round(ageH * 10) / 10, cadenceH, status, queue, note });
    };
    add("discover", "발굴 (grow·지역수색)", c.last_collect, 24, ds.behind, ds.behind ? `${ds.behind}/${ds.n} 지역 3일+ 지연` : `${ds.n}개 지역 순환중`);
    add("collect", "수집 (warmup·raw)", c.last_collect, 16, c.synth_q, `raw 수집·재수집`);
    add("synth", "합성 (옥석·등급)", c.last_synth, 24, c.synth_q, c.synth_q ? "미합성 적체" : "적체 없음");
    // 카테고리·동 채움 단계도 개별 모니터(발굴~수집 세분화)
    {
      const catRun = jobRuns.find((j: any) => j.job === "dong-backfill");
      const heldCat = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE needs_category AND NOT published`.catch(() => [{ n: 0 }]))[0] as any;
      const cAge = ageHours(catRun?.ran_at ?? null, now);
      agents.push({ key: "category", label: "카테고리 검증", lastRun: catRun?.ran_at ?? null, ageH: cAge == null ? null : Math.round(cAge * 10) / 10, cadenceH: 26, status: heldCat.n > 100 ? "warn" : "ok", queue: heldCat.n, note: heldCat.n ? `카테고리 검증대기 ${heldCat.n}` : "검증 완료" });
      const pubND = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published AND dong IS NULL`.catch(() => [{ n: 0 }]))[0] as any;
      const dAge = ageHours(catRun?.ran_at ?? null, now);
      agents.push({ key: "dongfill", label: "동 채움 (백필)", lastRun: catRun?.ran_at ?? null, ageH: dAge == null ? null : Math.round(dAge * 10) / 10, cadenceH: 26, status: pubND.n > 50 ? "warn" : "ok", queue: pubND.n, note: pubND.n ? `공개 동없음 ${pubND.n}` : "공개 동 100%" });
    }
    add("judge", "AI 판정 (Haiku·새벽)", c.last_judge, 30, c.judge_q, `판정 대기 ${c.judge_q}`);
    add("embed", "임베딩", c.last_embed, 30, c.embed_q, c.embed_q ? `미임베딩 ${c.embed_q}` : `완료(공개 ${c.published ? Math.round((c.pub_embedded / c.published) * 100) : 0}%)`);
    add("verify", "검증 레드팀", vr?.ran_at ?? null, 30, (vr?.fails ?? 0) + (vr?.warns ?? 0), vr ? `fail ${vr.fails}·warn ${vr.warns}` : "리포트 없음");
    // 품질감사: 미해결 플래그 기준(가동 시각은 flag 생성 시각으로 근사)
    {
      const open = af?.open ?? 0;
      const aAge = ageHours(af?.last_flag ?? null, now);
      agents.push({ key: "audit", label: "품질 자가감사", lastRun: af?.last_flag ?? null, ageH: aAge == null ? null : Math.round(aAge * 10) / 10, cadenceH: 30, status: open > 0 ? "warn" : "ok", queue: open, note: open ? `미해결 오염 ${open}건` : "오염 없음" });
    }
    {
      const sus = gr?.suspect ?? 0;
      const gAge = ageHours(gr?.last ?? null, now);
      agents.push({ key: "grounding", label: "LLM 그라운딩", lastRun: gr?.last ?? null, ageH: gAge == null ? null : Math.round(gAge * 10) / 10, cadenceH: 30, status: (sus > 0 || grBacklog.n > 0) ? "warn" : "ok", queue: grBacklog.n, note: `검사대기 ${grBacklog.n} · 의심 ${sus}건` });
    }

    // ── 4) 종합 건강 ──
    const core = agents.filter((a) => ["collect", "synth", "judge"].includes(a.key));
    const overall = (core.some((a) => a.status === "stalled") || jobFails.length || integrity.length) ? "critical"
      : agents.some((a) => a.status === "stalled" || a.status === "behind" || a.status === "warn") ? "degraded"
      : "healthy";
    // 배치 크래시·실패 + 데이터 무결성 위반을 최상단 경보로 — '관제탑이 잡아서 알림'
    const alerts = [...jobFails, ...integrity.map((s) => `🔎 무결성: ${s}`), ...agents.filter((a) => a.status === "stalled").map((a) => `${a.label} 멈춤(${a.ageH}h 전 마지막 가동)`)];

    const pct = (n: number) => (c.total ? Math.round((n / c.total) * 100) : 0);
    // 신규 카페 조립라인(발굴→합성→AI판정→임베딩→공개). 각 단계 대기 수 = '어디서 막혔나'.
    const pipeline = {
      stages: [
        { key: "new", label: "발굴", count: pl.p_new, note: "합성 대기" },
        { key: "pending", label: "검증중", count: pl.p_pending, note: "공개 전 게이트" },
        { key: "wait_judge", label: "AI판정 대기", count: pl.wait_judge, note: "새벽 판정" },
        { key: "wait_embed", label: "임베딩 대기", count: pl.wait_embed, note: "" },
        { key: "ready", label: "승격 준비", count: pl.ready, note: "곧 공개" },
        { key: "live", label: "공개됨", count: pl.live, note: "전 게이트 통과" },
        { key: "rejected", label: "차단", count: pl.rejected, note: "품질 미달" },
      ],
      promotedThisRun: promoted,
    };

    const health = {
      generatedAt: new Date(now).toISOString(),
      overall, alerts, healed, risks, integrity,
      coverage: { total: c.total, published: c.published, rawCachedPct: pct(c.raw_cached), judgedPct: pct(c.judged), embeddedPct: c.published ? Math.round((c.pub_embedded / c.published) * 100) : 0, dongPct: pct(td.has_dong) },
      today: { newCafes: td.new_today, synthesized: td.synth_today, published: td.published_today, hasDong: td.has_dong, dongPct: pct(td.has_dong), noise: td.noise, newQueue: td.new_q, ytToday: td.yt_today, ytTotal: td.yt_total },
      pipeline, agents,
      grounding: { suspectCount: gr?.suspect ?? 0, backlog: grBacklog.n, suspects: grSuspects },
    };

    await sql`INSERT INTO orchestrator_state (id, health, updated_at) VALUES (1, ${JSON.stringify(health)}, now())
      ON CONFLICT (id) DO UPDATE SET health = EXCLUDED.health, updated_at = now()`;

    return NextResponse.json({ ok: true, ...health });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
