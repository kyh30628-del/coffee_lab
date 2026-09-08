#!/usr/bin/env node
// 🔬 지역 진단 — "등록은 많은데 공개가 적다"의 원인을 등급·증거수·유입경로·등록시점으로 가른다.
//   실행: node scripts/region-diag.mjs "김해시" ["양산시" ...]   (여러 지역을 나란히 비교)
//
// 🔴 비용 규율: 작은 컬럼만 읽는다. synth_reviews·raw_reviews 같은 큰 컬럼은 값을 만지지 않는다
//   (IS NOT NULL은 TOAST를 풀지 않아 안전, length()·jsonb_array_length()는 전부 디토스트되므로 금지).
//   지역 하나당 수백 행이라 전수 스캔이 아니다.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const env = readFileSync(path.join(homedir(), "coffee-platform/web/.env.local"), "utf8");
const DB = (env.match(/^DATABASE_URL=(.+)$/m) || [])[1].trim().replace(/^['"]|['"]$/g, "");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(DB);

const areas = process.argv.slice(2);
if (!areas.length) { console.error('사용법: node scripts/region-diag.mjs "김해시" "양산시"'); process.exit(1); }

const have = new Set((await sql`
  SELECT column_name FROM information_schema.columns WHERE table_name = 'cafes'
`).map((r) => r.column_name));
const col = (n, fallback = "NULL") => (have.has(n) ? n : fallback);
const evCol = ["synth_ev_n", "synth_count"].find((c) => have.has(c)) || null;
const gradeCol = have.has("synth_grade") ? "synth_grade" : null;

for (const area of areas) {
  console.log(`\n━━━ ${area} ━━━`);
  const rows = await sql.query(
    `SELECT ${gradeCol ? gradeCol : `'?'`} AS grade,
            count(*)::int AS n,
            count(*) FILTER (WHERE published)::int AS pub,
            ${evCol ? `round(avg(${evCol})::numeric, 1)` : "NULL"} AS avg_ev,
            count(*) FILTER (WHERE raw_reviews IS NOT NULL)::int AS has_raw,
            min(created_at)::date AS first_seen,
            max(created_at)::date AS last_seen
     FROM cafes WHERE area = $1 GROUP BY 1 ORDER BY 2 DESC`, [area]);
  const tot = rows.reduce((s, r) => s + r.n, 0), pub = rows.reduce((s, r) => s + r.pub, 0);
  console.log(`등록 ${tot} · 공개 ${pub} (${(pub / Math.max(1, tot) * 100).toFixed(1)}%)`);
  console.log("등급".padEnd(8) + "등록".padStart(6) + "공개".padStart(6) + "평균증거".padStart(9) + "원문보유".padStart(9) + "  최초등록 ~ 최근등록");
  for (const r of rows) {
    console.log(String(r.grade ?? "(없음)").padEnd(8) + String(r.n).padStart(6) + String(r.pub).padStart(6) +
      String(r.avg_ev ?? "-").padStart(9) + String(r.has_raw).padStart(9) + `  ${r.first_seen} ~ ${r.last_seen}`);
  }
  // 유입 경로(source)와 최근 등록 추이 — '대량 시드'인지 '평소 발굴'인지 가른다
  const src = await sql.query(`SELECT ${col("source", `'?'`)} AS source, count(*)::int AS n, count(*) FILTER (WHERE published)::int AS pub FROM cafes WHERE area = $1 GROUP BY 1 ORDER BY 2 DESC`, [area]);
  console.log("경로: " + src.map((s) => `${s.source} ${s.n}(공개 ${s.pub})`).join(" · "));
  const days = await sql.query(`SELECT created_at::date AS d, count(*)::int AS n FROM cafes WHERE area = $1 GROUP BY 1 ORDER BY 1 DESC LIMIT 6`, [area]);
  console.log("최근 등록일: " + days.map((d) => `${String(d.d).slice(5)} ${d.n}곳`).join(" · "));
}
