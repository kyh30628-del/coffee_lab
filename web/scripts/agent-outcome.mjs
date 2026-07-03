// 에이전트 실행 결과(claude -p JSON)에서 '성과:'·'동료평가:' 한 줄을 뽑아
//   agent_runs.detail(성과) + peer_reviews(다면평가)에 기록한다. 성공 분기에서 heartbeat 대신 호출.
//   사용: node --import tsx scripts/agent-outcome.mjs <job> <result.json 경로>
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { recordRun } = await import("../lib/agentLog.ts");
const { sql } = await import("../lib/db.ts");
const { JOB_TO_MEMBER } = await import("../lib/org.ts");

const job = process.argv[2];
const jf = process.argv[3];
let result = "";
try { result = String(JSON.parse(readFileSync(jf, "utf8")).result || ""); } catch { /* 빈 결과 */ }
const isEmptyVal = (s) => !s || /^(없(음|다|어|네)|변화\s*없|해당\s*없음|n\/?a|none|생략)/i.test(String(s).trim());

// 성과 한 줄 — 없으면 "완료"
let perf = "완료";
const pm = result.match(/성과\s*[:：]\s*(.+)/);
if (pm && pm[1].trim()) perf = pm[1].trim().slice(0, 220);

// 주간목표·KPI → team_kpis (팀별·주별). 그 주 최초 실행이 목표를 확정 → 주중 안정(준수 대상 고정).
await sql`CREATE TABLE IF NOT EXISTS team_kpis (id SERIAL PRIMARY KEY, scope TEXT, week_start DATE, goal TEXT, updated_by TEXT, updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE(scope, week_start))`.catch(() => {});
const gm = result.match(/주간목표\s*[:：]\s*(.+)/);
const team = JOB_TO_MEMBER[job]?.team;
if (gm && !isEmptyVal(gm[1]) && team) {
  const goal = gm[1].trim().slice(0, 320);
  await sql`INSERT INTO team_kpis (scope, week_start, goal, updated_by) VALUES (${team}, date_trunc('week', now() AT TIME ZONE 'Asia/Seoul')::date, ${goal}, ${job}) ON CONFLICT (scope, week_start) DO NOTHING`.catch(() => {});
}
await sql`DELETE FROM team_kpis WHERE week_start < (now() AT TIME ZONE 'Asia/Seoul')::date - interval '35 days'`.catch(() => {}); // 5주 보존

// 동료평가 — "동료평가: 대상 | 한 줄 평가" (여러 줄 가능)
await sql`CREATE TABLE IF NOT EXISTS peer_reviews (id SERIAL PRIMARY KEY, reviewer TEXT, target TEXT, note TEXT, created_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
const evals = [...result.matchAll(/동료평가\s*[:：]\s*(.+)/g)].map((m) => m[1].trim()).filter(Boolean);
const isEmpty = (s) => !s || /^(없(음|다|어|네)|해당\s*없음|n\/?a|none|생략)/i.test(s.trim());
for (const e of evals.slice(0, 3)) {
  const parts = e.split(/[|｜]/);
  if (parts.length < 2) continue; // 대상 미지정(진짜 평가는 대상을 지목) → 스킵
  const target = parts[0].trim().slice(0, 60);
  const note = parts.slice(1).join("|").trim().slice(0, 220);
  if (isEmpty(target) || isEmpty(note)) continue; // '없음' 류 노이즈 스킵
  await sql`INSERT INTO peer_reviews (reviewer, target, note) VALUES (${job}, ${target}, ${note})`.catch(() => {});
}
await sql`DELETE FROM peer_reviews WHERE created_at < now()-interval '14 days'`.catch(() => {}); // 2주 보존

if (job) await recordRun(job, true, perf, 0).catch(() => {});
process.exit(0);
