import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { recordRun } from "@/lib/agentLog";

export const runtime = "nodejs";

// 💰 Neon 데이터전송비 이상탐지 워치독(2026-07-29, CEO 지시).
//   배경: youtube-backfill.mjs의 반복조회 버그가 한 달간 조용히 ~660GB를 읽어 청구서($58.58)로 처음 발견됐다
//   (feedback: "그런 일들이 원천적으로 일어나지 않아야지... 발견해서 빨리 조치할 수 있게 해줘야 정상 아니냐").
//   pg_stat_statements를 매일 어제 스냅샷과 비교해 "하루만에 비정상적으로 커진 쿼리"를 결정론으로 잡는다.
//   임계치 초과 시 ok=false로 recordRun → issues 보드에 HIGH로 자동 상신 + self-audit 자동기동(기존 인프라 재사용, 새 알림채널 없음).
const PER_QUERY_GB_ALERT = Number(process.env.COST_WATCH_PER_QUERY_GB || 10); // 하루 한 쿼리가 이 이상 새로 읽으면 경보(버그 실측 ~22.8GB/일보다 낮게 잡아 조기탐지)
const TOTAL_GB_ALERT = Number(process.env.COST_WATCH_TOTAL_GB || 25); // 전체 합산 하루 이 이상이면 경보(정상 베이스라인 ~14GB/일의 ~1.8배)
const XFER_RATE = 0.032; // Neon 공용 네트워크 전송(발신) 공개단가 $/GB

// 📧 매일 아침 비용 점검 메일(CEO 지시 2026-08-03). 전송량 추이는 기존 실행이력(agent_runs)에서 파싱 — 새 테이블/무거운 조회 없음.
async function sendCostReport(todayGb: number, top: { q: string; deltaGb: number } | null, anomaly: boolean) {
  const key = process.env.RESEND_API_KEY; if (!key) return;
  const to = process.env.COST_REPORT_EMAIL || "kyh30628@gmail.com"; // 이미 공개 git 커밋에 있는 주소(신규 노출 아님)
  // 최근 30일 costwatch 실행이력에서 '총 X GB' 파싱 → 추이
  const hist = (await sql`SELECT detail, to_char(ran_at AT TIME ZONE 'Asia/Seoul','MM-DD') d FROM agent_runs WHERE job='cron-costwatch' AND ran_at >= now() - interval '31 days' ORDER BY ran_at DESC`.catch(() => [])) as { detail: string; d: string }[];
  const days = hist.map((h) => ({ d: h.d, gb: Number((String(h.detail).match(/총\s*([\d.]+)\s*GB/) || [])[1] || NaN) })).filter((x) => Number.isFinite(x.gb));
  const avg = (a: number[]) => a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0;
  const last7 = avg(days.slice(0, 7).map((x) => x.gb));
  const prev = avg(days.slice(7, 21).map((x) => x.gb)); // 그 이전 2주
  const trend = last7 > prev * 1.15 ? "↑ 상승" : last7 < prev * 0.85 ? "↓ 하락" : "≈ 유지";
  const spark = days.slice(0, 10).reverse().map((x) => `${x.d} ${x.gb.toFixed(1)}GB`).join(" · ");
  const estDay = todayGb * XFER_RATE, estMo = last7 * XFER_RATE * 30;
  const c = anomaly ? "#c0392b" : "#2b7a4b";
  const html = `<div style="font-family:system-ui,'Apple SD Gothic Neo',sans-serif;max-width:560px;color:#2b2018">
    <h2 style="margin:0 0 4px">☕ 일일 비용 점검</h2>
    <p style="color:#8a7256;margin:0 0 16px;font-size:13px">Neon 데이터전송 기준 · 총 청구액은 월 인보이스가 기준</p>
    <div style="border:1px solid #e5d8c2;border-radius:12px;padding:16px">
      <div style="font-size:13px;color:#8a7256">어제 데이터전송</div>
      <div style="font-size:26px;font-weight:700;color:${c}">${todayGb.toFixed(1)} GB <span style="font-size:13px;color:#8a7256;font-weight:400">/ 임계 ${TOTAL_GB_ALERT}GB · 추정 $${estDay.toFixed(2)}</span></div>
      ${anomaly ? '<div style="color:#c0392b;font-weight:700;margin-top:6px">🚨 임계 초과 — 확인 필요</div>' : ''}
      <hr style="border:none;border-top:1px solid #eee;margin:14px 0">
      <table style="font-size:14px;width:100%;border-collapse:collapse">
        <tr><td style="color:#8a7256;padding:3px 0">최근 7일 일평균</td><td style="text-align:right;font-weight:600">${last7.toFixed(1)} GB/일</td></tr>
        <tr><td style="color:#8a7256;padding:3px 0">직전 2주 일평균</td><td style="text-align:right">${prev.toFixed(1)} GB/일</td></tr>
        <tr><td style="color:#8a7256;padding:3px 0">추세</td><td style="text-align:right;font-weight:700">${trend}</td></tr>
        <tr><td style="color:#8a7256;padding:3px 0">월 환산(전송비 추정)</td><td style="text-align:right">~$${estMo.toFixed(0)}</td></tr>
      </table>
      ${top ? `<div style="font-size:12px;color:#8a7256;margin-top:10px">최다 전송 쿼리: ${String(top.q).replace(/\s+/g, " ").slice(0, 90)} (${top.deltaGb.toFixed(1)}GB)</div>` : ''}
      <div style="font-size:12px;color:#a99;margin-top:10px">추이: ${spark || "누적 중"}</div>
    </div>
    <p style="color:#a99;font-size:11px;margin-top:12px">참고: 이 수치는 데이터전송(발신)만. 컴퓨트·저장·총 $는 Vercel/Neon 월 인보이스 기준.</p>
  </div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>", to: [to], subject: `${anomaly ? "🚨" : "☕"} 일일 비용 점검 — 어제 ${todayGb.toFixed(1)}GB (${trend})`, html }),
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

    const hasExt = (await sql`SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements'`.catch(() => [])) as any[];
    if (!hasExt.length) {
      await recordRun("cron-costwatch", true, "pg_stat_statements 미설치 — 스킵(무해)", 0);
      return NextResponse.json({ ok: true, skipped: "no-extension" });
    }

    // GROUP BY 필수: pg_stat_statements는 (userid,dbid,queryid)별 행이라 같은 queryid가 여러 행일 수 있음
    //   (2026-07-29 로컬테스트에서 실제로 "ON CONFLICT DO UPDATE cannot affect row a second time" 오류로 발견) — 합산해 유일화.
    const cur = (await sql`SELECT queryid, MAX(LEFT(query, 200)) q, SUM(calls)::bigint calls, SUM(shared_blks_read)::bigint blks_read
      FROM pg_stat_statements WHERE queryid IS NOT NULL GROUP BY queryid`) as { queryid: string; q: string; calls: string; blks_read: string }[];
    const prev = (await sql`SELECT queryid, blks_read FROM cost_watch_snapshot`) as { queryid: string; blks_read: string }[];
    const prevMap = new Map(prev.map((p) => [p.queryid, BigInt(p.blks_read)]));

    let totalDeltaBlocks = BigInt(0);
    let top: { q: string; deltaGb: number } | null = null;
    for (const r of cur) {
      const curBlocks = BigInt(r.blks_read);
      const prevBlocks = prevMap.get(r.queryid);
      // prev 없음(신규 쿼리) 또는 curBlocks < prevBlocks(evict·리셋)면 현재값을 그대로 델타로 취급(과소평가 방지, 오탐 방지 둘 다 안전한 쪽).
      const delta = prevBlocks == null || curBlocks < prevBlocks ? curBlocks : curBlocks - prevBlocks;
      totalDeltaBlocks += delta;
      const deltaGb = Number(delta) * 8 / 1024 / 1024;
      if (!top || deltaGb > top.deltaGb) top = { q: r.q, deltaGb };
    }
    const totalGb = Number(totalDeltaBlocks) * 8 / 1024 / 1024;

    // 스냅샷 갱신(다음날 비교용) — pg_stat_statements가 최대 5천 행까지 잡혀 행별 왕복 쿼리는 그 자체로 느리고 낭비
    //   (2026-07-29 로컬테스트: 4,915건 개별 UPSERT가 120초+ 걸림 — 비용감시 도구가 비용을 만드는 아이러니 방지).
    //   unnest로 배열 파라미터 하나만 보내 단일 왕복으로 처리.
    if (cur.length) {
      await sql`
        INSERT INTO cost_watch_snapshot (queryid, query_sample, blks_read, calls, snapshot_at)
        SELECT queryid, query_sample, blks_read, calls, now()
        FROM unnest(
          ${cur.map((r) => r.queryid)}::bigint[],
          ${cur.map((r) => r.q)}::text[],
          ${cur.map((r) => r.blks_read)}::bigint[],
          ${cur.map((r) => r.calls)}::bigint[]
        ) AS t(queryid, query_sample, blks_read, calls)
        ON CONFLICT (queryid) DO UPDATE SET
          query_sample = EXCLUDED.query_sample, blks_read = EXCLUDED.blks_read,
          calls = EXCLUDED.calls, snapshot_at = now()
      `.catch(() => {});
    }
    // 더 이상 안 보이는(evict된) 옛 스냅샷 정리 — 무한 누적 방지.
    await sql`DELETE FROM cost_watch_snapshot WHERE snapshot_at < now() - interval '14 days'`.catch(() => {});

    const anomaly = (top && top.deltaGb >= PER_QUERY_GB_ALERT) || totalGb >= TOTAL_GB_ALERT;
    const detail = anomaly
      ? `🚨 데이터전송 이상: 오늘 총 ${totalGb.toFixed(1)}GB(임계 ${TOTAL_GB_ALERT}GB)` +
        (top && top.deltaGb >= PER_QUERY_GB_ALERT ? ` · 최다쿼리 ${top.deltaGb.toFixed(1)}GB: ${top.q.replace(/\s+/g, " ").slice(0, 100)}` : "")
      : `정상 — 오늘 총 ${totalGb.toFixed(1)}GB(임계 ${TOTAL_GB_ALERT}GB), 최다쿼리 ${top ? top.deltaGb.toFixed(1) : 0}GB`;

    await recordRun("cron-costwatch", !anomaly, detail, cur.length);
    await sendCostReport(totalGb, top, anomaly).catch(() => {}); // 📧 매일 아침 CEO 비용 점검 메일(발송 실패는 점검 자체를 막지 않음)
    return NextResponse.json({ ok: true, anomaly, totalGb: +totalGb.toFixed(2), top, checked: cur.length });
  } catch (e) {
    await recordRun("cron-costwatch", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
