import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { recordRun } from "@/lib/agentLog";
import { pruneLedger } from "@/lib/runLedger";
import { setCostHalt } from "@/lib/costGuard";

export const runtime = "nodejs";

// 💰 Neon 데이터전송비 이상탐지 워치독(2026-07-29, CEO 지시).
//   배경: youtube-backfill.mjs의 반복조회 버그가 한 달간 조용히 ~660GB를 읽어 청구서($58.58)로 처음 발견됐다
//   (feedback: "그런 일들이 원천적으로 일어나지 않아야지... 발견해서 빨리 조치할 수 있게 해줘야 정상 아니냐").
//   pg_stat_statements를 매일 어제 스냅샷과 비교해 "하루만에 비정상적으로 커진 쿼리"를 결정론으로 잡는다.
//   임계치 초과 시 ok=false로 recordRun → issues 보드에 HIGH로 자동 상신 + self-audit 자동기동(기존 인프라 재사용, 새 알림채널 없음).
const PER_QUERY_GB_ALERT = Number(process.env.COST_WATCH_PER_QUERY_GB || 10); // 하루 한 쿼리가 이 이상 새로 읽으면 경보(버그 실측 ~22.8GB/일보다 낮게 잡아 조기탐지) — 단일쿼리 폭주는 서비스 성장과 무관한 버그 신호라 절대값 유지
const TOTAL_GB_FLOOR = Number(process.env.COST_WATCH_TOTAL_GB || 25); // 중앙값이 작거나(신규 배포) 이력이 없을 때의 하한(기존 절대임계값 그대로 보존)
const XFER_RATE = 0.032; // Neon 공용 네트워크 전송(발신) 공개단가 $/GB

// 📧 매일 아침 비용 점검 메일(CEO 지시 2026-08-03). 지난달(cost_baseline) vs 이번달(실행이력) 정면 비교. 새 무거운 조회 없음.

// ⏰ 가동시간 워치독(2026-08-18, CEO 지적 — "DB 자는 걸로 했잖아").
//   왜 필요했나: 이 워치독은 **데이터 전송량(GB)**만 봤다. 그런데 Neon 과금의 절반 이상은
//   **깨어 있는 시간(compute)**이다. 그래서 크롤러발 ISR 재생성이 DB를 하루 10.4시간 붙잡고 있어도
//   전송량은 정상이라 조용히 지나갔다 — 사장님이 물어봐서야 발견됐다. 그 구멍을 막는다.
//   비용: 이미 있는 타임스탬프 3종을 하루 1회 집계(작은 컬럼·인덱스 사용). 새 테이블·새 크론 없음.
async function awakeStats(): Promise<{ wakes: number; awakeMin: number; nightMin: number; medianMin: number }> {
  try {
    const r = (await sql`
      WITH ev AS (
        SELECT ts FROM traffic_events WHERE ts > now()-interval '24 hours'
        UNION ALL SELECT started_at FROM run_ledger WHERE started_at > now()-interval '24 hours'
        UNION ALL SELECT ran_at FROM agent_runs WHERE ran_at > now()-interval '24 hours'
      ), o AS (SELECT ts, lag(ts) OVER (ORDER BY ts) prev FROM ev),
      k AS (SELECT ts, CASE WHEN prev IS NULL OR ts-prev > interval '5 minutes' THEN 1 ELSE 0 END nw FROM o),
      g AS (SELECT ts, sum(nw) OVER (ORDER BY ts) grp FROM k),
      w AS (SELECT grp, min(ts) st, max(ts) en FROM g GROUP BY grp)
      SELECT count(*)::int wakes,
             round(sum(EXTRACT(epoch FROM (en-st))/60 + 5)::numeric)::int awake_min,
             round(sum(CASE WHEN extract(hour from st AT TIME ZONE 'Asia/Seoul') BETWEEN 0 AND 7
                   THEN EXTRACT(epoch FROM (en-st))/60 + 5 ELSE 0 END)::numeric)::int night_min
      FROM w`)[0] as any;
    // 비교 기준선 = 최근 7일 '일별 가동시간'의 중앙값(평균 아님 — 주말 피크 한 번에 끌려가지 않게).
    const m = (await sql`
      WITH ev AS (
        SELECT ts FROM traffic_events WHERE ts > now()-interval '8 days'
        UNION ALL SELECT started_at FROM run_ledger WHERE started_at > now()-interval '8 days'
        UNION ALL SELECT ran_at FROM agent_runs WHERE ran_at > now()-interval '8 days'
      ), o AS (SELECT ts, lag(ts) OVER (ORDER BY ts) prev FROM ev),
      k AS (SELECT ts, CASE WHEN prev IS NULL OR ts-prev > interval '5 minutes' THEN 1 ELSE 0 END nw FROM o),
      g AS (SELECT ts, sum(nw) OVER (ORDER BY ts) grp FROM k),
      w AS (SELECT grp, min(ts) st, max(ts) en FROM g GROUP BY grp),
      d AS (SELECT (st AT TIME ZONE 'Asia/Seoul')::date dd,
                   sum(EXTRACT(epoch FROM (en-st))/60 + 5) mins FROM w GROUP BY 1)
      SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY mins)::numeric)::int med
      FROM d WHERE dd < (now() AT TIME ZONE 'Asia/Seoul')::date`)[0] as any;
    return { wakes: Number(r?.wakes ?? 0), awakeMin: Number(r?.awake_min ?? 0), nightMin: Number(r?.night_min ?? 0), medianMin: Number(m?.med ?? 0) };
  } catch { return { wakes: 0, awakeMin: 0, nightMin: 0, medianMin: 0 }; }
}
// 🔴 2026-08-22 설계 수리 — 절대 임계(660분)는 **서비스가 성장하면 스스로를 멈추는 장치**였다.
//   실측: 가동시간은 방문자 수에 정비례한다(45명→6.2h · 130명→11.9h · 258명→13.6h).
//   기준선을 잡은 08-18은 방문자 100명이었는데, 130명인 08-21에 11.9h가 나와 임계를 넘었고
//   08-22 08:01 자동정지가 걸려 **cron-grow·sentinel·synth가 통째로 스킵**됐다(실제 피해).
//   → 절대값 대신 **최근 7일 중앙값 대비 배수**로 본다. 트래픽이 늘면 중앙값이 따라 올라
//     정상 성장은 통과하고, 폴링 폭주 같은 진짜 이상(중앙값의 몇 배)만 걸린다.
const AWAKE_MEDIAN_MULT = Number(process.env.COST_WATCH_AWAKE_MULT || 1.6);
const AWAKE_MIN_FLOOR = Number(process.env.COST_WATCH_AWAKE_FLOOR || 900); // 15h — 중앙값이 작을 때 과민반응 방지

// 🔴 2026-09-03 설계 수리 — 전송량 절대임계(25GB/일)도 위 가동시간과 동일한 함정이었다.
//   실측: 공개카페 19,220건·대형컬럼 행평균 78KB로 정상 베이스라인 자체가 서비스 성장에 비례해 오른다.
//   같은 절대임계로 08-19(#785→#786)·08-21(#801)·09-01 세 차례 halt가 걸렸고 매번 "새 버그 아님, 정상 누적"으로
//   판정됐지만 halt는 다음날까지 24h간 cron-synth/resynth/grow/exposure/youtube-backfill을 전면 정지시켰다.
//   → 가동시간 워치독과 동일 패턴(최근 7일 중앙값×배수, 이력 없을 때만 절대 하한)으로 전환.
const TOTAL_MEDIAN_MULT = Number(process.env.COST_WATCH_TOTAL_MULT || 1.6);

// 최근 7일(오늘 제외) costwatch 실행이력에서 일별 총 전송량(GB)의 중앙값을 뽑는다.
//   agent_runs.detail의 "총 X GB" 표기를 그대로 재사용 — 새 테이블 없음.
async function transferMedianGb(): Promise<number> {
  try {
    const rows = (await sql`SELECT to_char(ran_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') d, detail
      FROM agent_runs WHERE job='cron-costwatch' AND ran_at > now() - interval '8 days'
      ORDER BY ran_at DESC`) as { d: string; detail: string }[];
    const byDay = new Map<string, number>();
    for (const r of rows) {
      if (byDay.has(r.d)) continue; // 하루 여러 실행 시 최신값만
      const m = String(r.detail).match(/총\s*([\d.]+)\s*GB/);
      if (m) byDay.set(r.d, Number(m[1]));
    }
    const vals = [...byDay.values()].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    if (!vals.length) return 0;
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  } catch { return 0; }
}

async function sendCostReport(todayGb: number, top: { q: string; deltaGb: number } | null, anomaly: boolean, execMin: number, totalLimit: number) {
  const key = process.env.RESEND_API_KEY; if (!key) return;
  const to = process.env.COST_REPORT_EMAIL || "kyh30628@gmail.com"; // 이미 공개 git 커밋에 있는 주소(신규 노출 아님)
  // 지난달 기준선(인보이스 실측, DB에 저장 — 공개 소스에 금액 하드코딩 안 함)
  const base = (await sql`SELECT period, transfer_gb::float gb, days, transfer_usd::float tusd, compute_usd::float cusd, compute_cuh::float ccuh, total_usd::float total FROM cost_baseline ORDER BY period DESC LIMIT 1`.catch(() => []))[0] as any;
  const julAvg = base ? base.gb / base.days : 23.8;
  // 이번 KST월 costwatch 일일 전송 이력 → 일별 dedup 후 합산(이번달 누적·경과일)
  const rows = (await sql`SELECT to_char(ran_at AT TIME ZONE 'Asia/Seoul','MM-DD') d, detail
    FROM agent_runs WHERE job='cron-costwatch'
      AND (ran_at AT TIME ZONE 'Asia/Seoul') >= date_trunc('month', now() AT TIME ZONE 'Asia/Seoul')
    ORDER BY ran_at DESC`.catch(() => [])) as { d: string; detail: string }[];
  const byDay = new Map<string, number>();
  for (const r of rows) { if (byDay.has(r.d)) continue; const gb = Number((String(r.detail).match(/총\s*([\d.]+)\s*GB/) || [])[1]); if (Number.isFinite(gb)) byDay.set(r.d, gb); }
  const augDays = byDay.size || 1;
  const augCum = [...byDay.values()].reduce((s, n) => s + n, 0);
  const augAvg = augCum / augDays;
  const pct = julAvg > 0 ? Math.round((augAvg - julAvg) / julAvg * 100) : 0;
  const up = augAvg > julAvg * 1.05, down = augAvg < julAvg * 0.95;
  const cmp = up ? `↑ ${pct}% 높음` : down ? `↓ ${Math.abs(pct)}% 낮음` : "≈ 비슷";
  const cmpColor = up ? "#c0392b" : down ? "#2b7a4b" : "#8a7256";
  const augProjUsd = augAvg * 31 * XFER_RATE; // 이대로면 이번달 전송비 추정
  const estDay = todayGb * XFER_RATE;
  // 🖥️ 컴퓨트(DB) 추정: 어제 DB가 '깨어있던 시간'(활동 타임스탬프 5분 버킷) × CU_size × $0.106.
  //   CU_size는 7월 인보이스에서 역산(7월은 chat-watch로 24h 깨어있었으니 CU-h/(days*24)).
  const abk = (await sql`SELECT count(DISTINCT floor(extract(epoch from t)/300))::int b FROM (
      SELECT ts t FROM traffic_events WHERE ts >= now() - interval '24 hours'
      UNION ALL SELECT ran_at FROM agent_runs WHERE ran_at >= now() - interval '24 hours'
    ) u`.catch(() => [{ b: 0 }]))[0] as any;
  const activeH = Math.min(24, (Number(abk?.b || 0) * 5) / 60); // 어제 DB 활성 시간(추정)
  const cuSize = base && base.ccuh ? base.ccuh / (base.days * 24) : 0.6;
  const compDay = activeH * cuSize * 0.106; // Neon CU-시간 공개단가 $0.106
  const compMonth = compDay * 30;
  const julCompDay = base ? base.cusd / base.days : 1.52;
  const cUp = compDay > julCompDay * 1.05, cDown = compDay < julCompDay * 0.95;
  const compCmp = cUp ? `↑ ${Math.round((compDay / julCompDay - 1) * 100)}% 높음` : cDown ? `↓ ${Math.round((1 - compDay / julCompDay) * 100)}% 낮음` : "≈ 비슷";
  const compColor = cUp ? "#c0392b" : cDown ? "#2b7a4b" : "#8a7256";
  // 💵 전송+컴퓨트+저장 합산 월 추정 (7월 인보이스 총액과 동일 기준: VAT 10% 포함)
  const storUsd = base ? Math.max(0.5, base.total / 1.1 - base.tusd - base.cusd) : 0.7; // 저장 ≈ 소계 - 전송 - 컴퓨트
  const projSub = augProjUsd + compMonth + storUsd;
  const projTotal = projSub * 1.1;
  const tUp = base && projTotal > base.total * 1.05, tDown = base && projTotal < base.total * 0.95;
  const totCmp = tUp ? `↑ ${base ? Math.round((projTotal / base.total - 1) * 100) : 0}% 높음` : tDown ? `↓ ${base ? Math.round((1 - projTotal / base.total) * 100) : 0}% 낮음` : "≈ 비슷";
  const totColor = tUp ? "#c0392b" : tDown ? "#2b7a4b" : "#8a7256";
  const c = anomaly ? "#c0392b" : "#2b7a4b";
  const html = `<div style="font-family:system-ui,'Apple SD Gothic Neo',sans-serif;max-width:560px;color:#2b2018">
    <h2 style="margin:0 0 4px">☕ 일일 비용 점검</h2>
    <p style="color:#8a7256;margin:0 0 16px;font-size:13px">Neon 기준 추정 · 정확한 청구는 월 인보이스</p>
    <div style="border:2px solid ${totColor};border-radius:14px;padding:18px;margin-bottom:16px">
      <div style="font-size:13px;color:#8a7256">📊 이대로면 8월 총 (전송+컴퓨트+저장, VAT 포함)</div>
      <div style="font-size:30px;font-weight:800;color:${totColor};margin:4px 0">~$${projTotal.toFixed(0)} <span style="font-size:14px;font-weight:400;color:#8a7256">vs 7월 $${base ? base.total.toFixed(2) : "-"}</span></div>
      <div style="font-size:15px;font-weight:700;color:${totColor}">${totCmp}</div>
      <div style="font-size:12px;color:#8a7256;margin-top:6px">전송 ~$${augProjUsd.toFixed(0)} + 컴퓨트 ~$${compMonth.toFixed(0)} + 저장 ~$${storUsd.toFixed(1)} → 소계 ~$${projSub.toFixed(0)} +VAT</div>
    </div>
    <div style="border:1px solid #e5d8c2;border-radius:12px;padding:16px;margin-bottom:14px">
      <div style="font-size:13px;color:#8a7256">어제 데이터전송</div>
      <div style="font-size:26px;font-weight:700;color:${c}">${todayGb.toFixed(1)} GB <span style="font-size:13px;color:#8a7256;font-weight:400">/ 임계 ${totalLimit.toFixed(1)}GB(7일 중앙값×${TOTAL_MEDIAN_MULT}) · 추정 $${estDay.toFixed(2)}</span></div>
      ${anomaly ? '<div style="color:#c0392b;font-weight:700;margin-top:6px">🚨 임계 초과 — 확인 필요</div>' : ''}
    </div>
    <div style="border:2px solid ${cmpColor};border-radius:12px;padding:16px;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700;margin-bottom:10px">📊 지난달(7월) 대비 — 전송량 기준</div>
      <table style="font-size:14px;width:100%;border-collapse:collapse">
        <tr><td style="color:#8a7256;padding:4px 0">7월</td><td style="text-align:right">일평균 <b>${julAvg.toFixed(1)}GB</b> · 총 ${base ? base.gb.toFixed(0) : "-"}GB · 청구 $${base ? base.total.toFixed(2) : "-"}</td></tr>
        <tr><td style="color:#8a7256;padding:4px 0">8월(현재 ${augDays}일)</td><td style="text-align:right">일평균 <b>${augAvg.toFixed(1)}GB</b> · 누적 ${augCum.toFixed(0)}GB</td></tr>
        <tr><td style="padding:8px 0 0;font-weight:700">→ 지난달 대비</td><td style="text-align:right;padding-top:8px;font-weight:800;font-size:16px;color:${cmpColor}">${cmp}</td></tr>
        <tr><td style="color:#8a7256;padding:4px 0">이대로면 8월 전송비</td><td style="text-align:right">~$${augProjUsd.toFixed(1)} <span style="color:#8a7256">(7월 전송 $${base ? base.tusd.toFixed(2) : "-"})</span></td></tr>
      </table>
    </div>
    <div style="border:2px solid ${compColor};border-radius:12px;padding:16px;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700;margin-bottom:10px">🖥️ 컴퓨트(DB) — 지난달 대비</div>
      <table style="font-size:14px;width:100%;border-collapse:collapse">
        <tr><td style="color:#8a7256;padding:4px 0">어제 DB 깨어있던 시간(추정)</td><td style="text-align:right;font-weight:600">${activeH.toFixed(1)}시간 / 24 <span style="color:#8a7256;font-weight:400">(${(24 - activeH).toFixed(1)}시간 잠)</span></td></tr>
        <tr><td style="color:#8a7256;padding:4px 0">추정 컴퓨트비</td><td style="text-align:right;font-weight:600">~$${compDay.toFixed(2)}/일 · 월 ~$${compMonth.toFixed(0)}</td></tr>
        <tr><td style="color:#8a7256;padding:4px 0">7월</td><td style="text-align:right">일 $${julCompDay.toFixed(2)} · 월 $${base ? base.cusd.toFixed(2) : "-"} <span style="color:#8a7256">(24h 깨어있었음)</span></td></tr>
        <tr><td style="padding:8px 0 0;font-weight:700">→ 지난달 대비</td><td style="text-align:right;padding-top:8px;font-weight:800;font-size:16px;color:${compColor}">${compCmp}</td></tr>
        <tr><td style="color:#8a7256;padding:4px 0">어제 DB 처리시간</td><td style="text-align:right;color:#8a7256">${execMin.toFixed(0)}분</td></tr>
      </table>
      <div style="font-size:11px;color:#a99;margin-top:8px">추정식: DB 활성시간 × CU_size(${cuSize.toFixed(2)}, 7월 인보이스서 역산) × $0.106/CU-h. 정확한 청구는 Neon 인보이스 기준.</div>
    </div>
    ${top ? `<div style="font-size:12px;color:#8a7256">최다 전송 쿼리: ${String(top.q).replace(/\s+/g, " ").slice(0, 90)} (${top.deltaGb.toFixed(1)}GB)</div>` : ''}
    <p style="color:#a99;font-size:11px;margin-top:12px">전송량(발신)만 매일 측정 가능. 컴퓨트·총 $는 월 인보이스가 기준(7월 총 $${base ? base.total.toFixed(2) : "-"}).</p>
  </div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>", to: [to], subject: `${anomaly ? "🚨" : "☕"} 일일 비용 — 8월 일평균 ${augAvg.toFixed(1)}GB (지난달 대비 ${cmp})`, html }),
  }).catch(() => {});
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    await sql`CREATE TABLE IF NOT EXISTS cost_watch_snapshot (
      queryid BIGINT PRIMARY KEY,
      query_sample TEXT,
      blks_read BIGINT NOT NULL,
      calls BIGINT NOT NULL,
      snapshot_at TIMESTAMPTZ DEFAULT now()
    )`;
    await sql`ALTER TABLE cost_watch_snapshot ADD COLUMN IF NOT EXISTS exec_ms DOUBLE PRECISION DEFAULT 0`.catch(() => {}); // 컴퓨트 부하 프록시(누적 실행시간)

    const hasExt = (await sql`SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements'`.catch(() => [])) as any[];
    if (!hasExt.length) {
      await recordRun("cron-costwatch", true, "pg_stat_statements 미설치 — 스킵(무해)", 0);
      return NextResponse.json({ ok: true, skipped: "no-extension" });
    }

    // GROUP BY 필수: pg_stat_statements는 (userid,dbid,queryid)별 행이라 같은 queryid가 여러 행일 수 있음
    //   (2026-07-29 로컬테스트에서 실제로 "ON CONFLICT DO UPDATE cannot affect row a second time" 오류로 발견) — 합산해 유일화.
    const cur = (await sql`SELECT queryid, MAX(LEFT(query, 200)) q, SUM(calls)::bigint calls, SUM(shared_blks_read)::bigint blks_read, SUM(total_exec_time)::float exec_ms
      FROM pg_stat_statements WHERE queryid IS NOT NULL GROUP BY queryid`) as { queryid: string; q: string; calls: string; blks_read: string; exec_ms: number }[];
    const prev = (await sql`SELECT queryid, blks_read, exec_ms FROM cost_watch_snapshot`) as { queryid: string; blks_read: string; exec_ms: number }[];
    const prevMap = new Map(prev.map((p) => [p.queryid, BigInt(p.blks_read)]));
    const prevExec = new Map(prev.map((p) => [p.queryid, Number(p.exec_ms || 0)]));

    let totalDeltaBlocks = BigInt(0);
    let totalDeltaExecMs = 0; // 컴퓨트 부하 프록시(어제 DB 처리시간)
    let top: { q: string; deltaGb: number } | null = null;
    for (const r of cur) {
      const curBlocks = BigInt(r.blks_read);
      const prevBlocks = prevMap.get(r.queryid);
      // prev 없음(신규 쿼리) 또는 curBlocks < prevBlocks(evict·리셋)면 현재값을 그대로 델타로 취급(과소평가 방지, 오탐 방지 둘 다 안전한 쪽).
      const delta = prevBlocks == null || curBlocks < prevBlocks ? curBlocks : curBlocks - prevBlocks;
      totalDeltaBlocks += delta;
      const curExec = Number(r.exec_ms || 0), pe = prevExec.get(r.queryid);
      totalDeltaExecMs += pe == null || curExec < pe ? curExec : curExec - pe;
      const deltaGb = Number(delta) * 8 / 1024 / 1024;
      if (!top || deltaGb > top.deltaGb) top = { q: r.q, deltaGb };
    }
    const totalGb = Number(totalDeltaBlocks) * 8 / 1024 / 1024;
    const execMin = totalDeltaExecMs / 1000 / 60; // 어제 DB 처리시간(분) — 컴퓨트 부하 프록시

    // 스냅샷 갱신(다음날 비교용) — pg_stat_statements가 최대 5천 행까지 잡혀 행별 왕복 쿼리는 그 자체로 느리고 낭비
    //   (2026-07-29 로컬테스트: 4,915건 개별 UPSERT가 120초+ 걸림 — 비용감시 도구가 비용을 만드는 아이러니 방지).
    //   unnest로 배열 파라미터 하나만 보내 단일 왕복으로 처리.
    if (cur.length) {
      await sql`
        INSERT INTO cost_watch_snapshot (queryid, query_sample, blks_read, calls, exec_ms, snapshot_at)
        SELECT queryid, query_sample, blks_read, calls, exec_ms, now()
        FROM unnest(
          ${cur.map((r) => r.queryid)}::bigint[],
          ${cur.map((r) => r.q)}::text[],
          ${cur.map((r) => r.blks_read)}::bigint[],
          ${cur.map((r) => r.calls)}::bigint[],
          ${cur.map((r) => r.exec_ms)}::float8[]
        ) AS t(queryid, query_sample, blks_read, calls, exec_ms)
        ON CONFLICT (queryid) DO UPDATE SET
          query_sample = EXCLUDED.query_sample, blks_read = EXCLUDED.blks_read,
          calls = EXCLUDED.calls, exec_ms = EXCLUDED.exec_ms, snapshot_at = now()
      `.catch(() => {});
    }
    // 더 이상 안 보이는(evict된) 옛 스냅샷 정리 — 무한 누적 방지.
    await sql`DELETE FROM cost_watch_snapshot WHERE snapshot_at < now() - interval '14 days'`.catch(() => {});

    // ⏰ 가동시간 점검 — 전송량이 정상이어도 DB가 종일 깨어 있으면 그게 컴퓨트 청구서다(2026-08-18).
    const aw = await awakeStats();
    const awakeLimit = Math.max(AWAKE_MIN_FLOOR, Math.round(aw.medianMin * AWAKE_MEDIAN_MULT));
    const awakeBad = aw.medianMin > 0 && aw.awakeMin >= awakeLimit;

    // 전송량 임계 — 이력이 쌓일수록 7일 중앙값을 따라가고, 이력이 없으면 기존 절대 하한(25GB)으로 대체.
    const medGb = await transferMedianGb();
    const totalLimit = medGb > 0 ? Math.max(TOTAL_GB_FLOOR, Math.round(medGb * TOTAL_MEDIAN_MULT * 10) / 10) : TOTAL_GB_FLOOR;
    // 🔴 가동시간은 **경보만** 한다 — 자동정지에 넣지 않는다.
    //   전송량 폭주(7월 $58 사고의 지문)는 명백한 버그 신호라 멈추는 게 맞지만,
    //   가동시간은 트래픽이 늘어도 오른다. 여기서 멈추면 **잘 되는 날 서비스를 끄는 셈**이다.
    //   (CEO 원칙 "빨강은 소비자 손상일 때만"과도 같은 결. 가동시간 증가는 소비자 손상이 아니다.)
    const transferBad = (top && top.deltaGb >= PER_QUERY_GB_ALERT) || totalGb >= totalLimit;
    const anomaly = transferBad;
    const awakeTxt = `가동 ${(aw.awakeMin / 60).toFixed(1)}h/일(깨어남 ${aw.wakes}회, 새벽 ${aw.nightMin}분, 7일중앙값 ${(aw.medianMin / 60).toFixed(1)}h)`;
    const awakeNote = awakeBad ? `⚠️ 가동시간 주의: ${awakeTxt} — 중앙값의 ${AWAKE_MEDIAN_MULT}배(${(awakeLimit / 60).toFixed(1)}h) 초과. ` : "";
    const detail = anomaly
      ? awakeNote + `🚨 데이터전송 이상: 오늘 총 ${totalGb.toFixed(1)}GB(임계 ${totalLimit.toFixed(1)}GB, 7일중앙값 ${medGb.toFixed(1)}GB×${TOTAL_MEDIAN_MULT})` +
        (top && top.deltaGb >= PER_QUERY_GB_ALERT ? ` · 최다쿼리 ${top.deltaGb.toFixed(1)}GB: ${top.q.replace(/\s+/g, " ").slice(0, 100)}` : "")
      : awakeNote + `정상 — 총 ${totalGb.toFixed(1)}GB(임계 ${totalLimit.toFixed(1)}GB, 7일중앙값 ${medGb.toFixed(1)}GB×${TOTAL_MEDIAN_MULT}), ${awakeTxt}`;

    // 📒 하네스 L5 — 실행 원장 보존정리(90일). 하루 1회·행 수천 개 수준이라 부하 무시 가능.
    const pruned = await pruneLedger(90).catch(() => 0);
    // 🧹 이벤트 테이블 보존정리(2026-08-20 전수검사) — 아래 4개는 정리 경로가 아예 없어 **무한 누적**이었다.
    //   저장은 $0.35/GB-월 종량이라 작아도 방치하면 청구서가 되는 구조. 분석 지평(계절성 비교)만큼만 남긴다.
    //   traffic_events(90일)는 orchestrator가 이미 정리 — 여기 추가 금지(이중 삭제 방지).
    await sql`DELETE FROM search_log WHERE ts < now() - interval '90 days'`.catch(() => {});
    await sql`DELETE FROM share_events WHERE ts < now() - interval '365 days'`.catch(() => {});
    await sql`DELETE FROM outbound_clicks WHERE ts < now() - interval '365 days'`.catch(() => {});
    await sql`DELETE FROM owner_funnel_events WHERE ts < now() - interval '365 days'`.catch(() => {});
    await recordRun("cron-costwatch", !anomaly, detail + (pruned ? ` · 원장정리 ${pruned}행` : ""), cur.length);
    // 🛑 과다 시 자동 정지(무거운 자율 크론이 스킵) / 정상 복귀 시 자동 해제 — CEO "과다면 멈춰"
    await setCostHalt(anomaly, anomaly ? `자동정지: ${detail.slice(0, 150)}` : "정상").catch(() => {});
    await sendCostReport(totalGb, top, anomaly, execMin, totalLimit).catch(() => {}); // 📧 매일 아침 CEO 비용 점검 메일(발송 실패는 점검 자체를 막지 않음)
    return NextResponse.json({ ok: true, anomaly, halted: anomaly, totalGb: +totalGb.toFixed(2), totalLimit: +totalLimit.toFixed(1), transferMedianGb: +medGb.toFixed(1), execMin: +execMin.toFixed(1), awakeHours: +(aw.awakeMin / 60).toFixed(1), wakes: aw.wakes, nightMin: aw.nightMin, awakeMedianH: +(aw.medianMin / 60).toFixed(1), awakeWarn: awakeBad, top, checked: cur.length });
  } catch (e) {
    await recordRun("cron-costwatch", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
