// 🩺 하네스 상태 점검 — 자동 실행 이후 "하네스가 제대로 물렸는지"를 한 번에 본다.
//   사용: node --import tsx scripts/harness-check.mjs
//   ⚠️ 비용 규율: 집계 4회, 전부 작은 컬럼/숫자만. 큰 컬럼(raw_reviews·synth_reviews*)은 조회하지 않는다.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const kst = (s) => String(s ?? "").slice(5, 16);

console.log("═".repeat(72));
console.log("🩺 하네스 점검 —", new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }));
console.log("═".repeat(72));

// ① 자동 실행이 실제로 돌았나 (스케줄 크론이 하네스를 태우는지)
const runs = await sql`SELECT job, (started_at AT TIME ZONE 'Asia/Seoul')::text kst, ok,
    fingerprint IS NOT NULL fp, metrics->>'blobReads' blob, metrics->>'skipped' skipped,
    metrics->>'noEffect' ne, metrics->>'scopeViolations' sv, LEFT(detail, 60) d
  FROM run_ledger WHERE started_at > now() - interval '14 hours' ORDER BY id DESC LIMIT 25`;
console.log(`\n① 최근 14시간 실행 ${runs.length}건`);
for (const r of runs) {
  const tag = [r.fp ? "지문" : null, r.blob != null ? `blob${r.blob}` : null,
    r.skipped ? `동결스킵${r.skipped}` : null, r.ne && r.ne !== "0" ? `무효${r.ne}` : null,
    r.sv && r.sv !== "0" ? `🔐위반${r.sv}` : null].filter(Boolean).join(" ");
  console.log(`  ${kst(r.kst)} ${r.ok ? "✅" : "❌"} ${String(r.job).padEnd(22)} ${tag.padEnd(28)} ${r.d}`);
}

// ② 정체(헛돎) — 같은 문제집합 3회 연속
const { detectStuck } = await import("../lib/runLedger.ts");
const stuck = await detectStuck(48, 3);
console.log(`\n② 정체(같은 문제집합 3회+ 연속): ${stuck.length}건`);
stuck.forEach((s) => console.log(`  🔁 ${s.job} — ${s.repeats}회 (${kst(s.first_at)} ~ ${kst(s.last_at)})`));

// ③ 효과검증·동결 현황 = 사람 확인 대기
const frozen = await sql`SELECT job, COUNT(*)::int n,
    COUNT(*) FILTER (WHERE note LIKE '%오탐%')::int fp,
    COUNT(*) FILTER (WHERE note LIKE '%보존판정%')::int keep,
    COUNT(*) FILTER (WHERE note IS NULL OR note NOT LIKE '[사람판독%')::int unread
  FROM heal_attempts WHERE frozen_until > now() GROUP BY job ORDER BY n DESC`;
console.log(`\n③ 동결(자동으로 못 고쳐 사람에게 넘긴 것)`);
if (!frozen.length) console.log("  없음");
frozen.forEach((f) => console.log(`  ${String(f.job).padEnd(28)} ${f.n}건 (판독 대기 ${f.unread} · 오탐 ${f.fp} · 보존 ${f.keep})`));

// ④ 예산·게이트
const budget = await sql`SELECT job, SUM((metrics->>'blobReads')::int)::int n FROM run_ledger
  WHERE started_at > now() - interval '24 hours' AND metrics ? 'blobReads' GROUP BY job ORDER BY n DESC LIMIT 6`;
console.log(`\n④ 24시간 큰컬럼 로드 누적`);
budget.forEach((b) => console.log(`  ${String(b.job).padEnd(22)} ${b.n}`));
const iss = await sql`SELECT ikey, detail FROM issues WHERE ikey LIKE 'budget:%' AND status='open'`;
console.log(`  예산 초과 경고: ${iss.length ? iss.map((i) => i.ikey).join(", ") : "없음 ✅"}`);
const gates = await sql`SELECT COUNT(*)::int n, MAX(ROUND(EXTRACT(EPOCH FROM (now()-COALESCE(decided_at,created_at)))/3600))::int h
  FROM decisions WHERE (status='pending' AND COALESCE(tier,'L3')='L3')
     OR (status='approved' AND action_type='dev_task' AND action_params->>'dev_status'='배포대기')`;
console.log(`\n⑤ 사람 대기(게이트): ${gates[0].n}건 · 최장 ${gates[0].h ?? 0}h ${(gates[0].h ?? 0) >= 24 ? "⚠️ 24h+ 지연" : ""}`);
