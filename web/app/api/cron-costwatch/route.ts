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
    return NextResponse.json({ ok: true, anomaly, totalGb: +totalGb.toFixed(2), top, checked: cur.length });
  } catch (e) {
    await recordRun("cron-costwatch", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
