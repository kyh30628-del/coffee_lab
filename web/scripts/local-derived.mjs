#!/usr/bin/env node
// 🏠 로컬 파생 계산기 — Vercel 크론이 하던 "순수 파생 컬럼" 계산을 로컬에서 돌리고
//    결과만 Neon에 **한 방에** 밀어넣는다 (2026-08-28 CEO 지시).
//
// 왜: 기존 크론은 카페 한 곳마다 개별 UPDATE를 날렸다. 왕복 1회 = 198ms(실측)라
//    400곳 = 400왕복 = 80초를 DB를 붙잡고 있었고, 그게 Neon 요금(활성시간×CU)이다.
//    여기서는 ①한 번에 읽고 ②로컬 CPU로 계산하고 ③한 번에 쓴다 → 왕복 400회 → 2회.
//
// 안전:
//   · 쓰기는 lib/neonWriter.ts 경유 → derivedColumns.ts 화이트리스트 밖 컬럼은 예외로 차단.
//   · UPDATE ... FROM (VALUES) 라 **INSERT가 불가능**하다. 소비자/사장님이 남긴 기록은 손대지 않는다.
//   · published·synth_grade 등 결재 통제 컬럼은 애초에 화이트리스트 밖 = 이 경로로 못 나간다.
//   · 무거운 작업 가드(dbQuietHours) 적용 — 심야 실행·동시 실행 차단.
//
// 사용: node --import tsx scripts/local-derived.mjs enrich [--limit 400] [--dry]

import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const args = process.argv.slice(2);
const job = args[0];
const DRY = args.includes("--dry");
const LIMIT = Number((args.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || 400;

const { assertHeavyJobAllowed } = await import("../lib/dbQuietHours.ts");
const release = assertHeavyJobAllowed(`local-derived:${job}`);

const { sql } = await import("../lib/db.ts");
const { bulkUpdateDerived } = await import("../lib/neonWriter.ts");
const { recordRun } = await import("../lib/agentLog.ts");

/** cron-enrich 와 **같은 입력·같은 함수·같은 출력**. 다른 건 왕복 횟수뿐이다. */
async function enrich() {
  const { reputationSignals } = await import("../lib/enrich.ts");

  // ① 한 번에 읽기 — 조건·정렬·상한을 cron-enrich 와 동일하게 유지한다.
  const rows = await sql`SELECT id, name, synth_reviews, review_dates FROM cafes
    WHERE published AND synth_reviews IS NOT NULL
      AND (enriched_at IS NULL OR enriched_at < synth_updated)
    ORDER BY enriched_at ASC NULLS FIRST LIMIT ${LIMIT}`;

  // ② 로컬 CPU 계산 — DB 접속 없음.
  const parse = (o) => {
    let a = o;
    if (typeof a === "string") { try { a = JSON.parse(a); } catch { return []; } }
    return Array.isArray(a) ? a : (a && a.reviews) || [];
  };
  const out = [];
  let declining = 0;
  const declineNames = [];
  for (const c of rows) {
    const quotes = parse(c.synth_reviews)
      .map((r) => (typeof r === "string" ? r : r.quote || r.title || ""))
      .filter(Boolean);
    const rep = reputationSignals(quotes, c.review_dates);
    if (rep.declineNote && rep.declineNote.startsWith("최근 평")) {
      declining++; if (declineNames.length < 8) declineNames.push(c.name);
    }
    out.push({
      id: c.id,
      recent_ratio: rep.recentRatio,
      reputation_note: rep.declineNote ?? null,
      enriched_at: new Date().toISOString(),
    });
  }

  // ③ 한 번에 쓰기.
  const res = await bulkUpdateDerived(out, { dryRun: DRY, label: "local-enrich" });
  return { processed: out.length, declining, declineNames, write: res, remaining: rows.length === LIMIT };
}

const JOBS = { enrich };

if (!JOBS[job]) {
  console.error(`사용법: node --import tsx scripts/local-derived.mjs <${Object.keys(JOBS).join("|")}> [--limit=N] [--dry]`);
  release(); process.exit(1);
}

const t0 = Date.now();
try {
  const r = await JOBS[job]();
  const ms = Date.now() - t0;
  console.log(JSON.stringify({ job, ms, ...r }, null, 1));
  // 📒 조직관제가 이 잡을 "살아있다"고 인식하도록 원장에 남긴다(크론과 동일한 잡 이름).
  if (!DRY) await recordRun(`cron-${job}`, true, `로컬실행 ${r.processed}곳 ${ms}ms`, r.processed, { metrics: { processed: r.processed } });
} catch (e) {
  console.error("🔴", String(e));
  if (!DRY) await recordRun(`cron-${job}`, false, String(e).slice(0, 150)).catch(() => {});
  release(); process.exit(1);
}
release();
