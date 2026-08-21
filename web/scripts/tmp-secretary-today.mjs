import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

const today = '2026-08-21';

const dec = await sql`select id, tier, status, action_type, left(title,70) as title, decided_by, to_char(created_at,'HH24:MI') as ct, to_char(decided_at,'HH24:MI') as dt from decisions where created_at::date=${today} or decided_at::date=${today} order by id`;
console.log('--- decisions today ---');
dec.forEach(r=>console.log(r.id, r.tier, r.status, r.action_type, r.decided_by, r.ct, r.dt, r.title));

const coord = await sql`select id, status, left(topic,60) as subj, from_team, to_team, to_char(created_at,'HH24:MI') as ct, to_char(resolved_at,'HH24:MI') as rt from coordination where created_at::date=${today} or resolved_at::date=${today} order by id`;
console.log('--- coordination today ---');
coord.forEach(r=>console.log(r.id, r.status, r.from_team,'->',r.to_team, r.ct, r.rt, r.subj));

const runs = await sql`select job, ok, count(*) from agent_runs where ran_at::date=${today} group by job,ok order by job`;
console.log('--- agent_runs today (job,ok,count) ---');
runs.forEach(r=>console.log(r.job, r.ok, r.count));

const fails = await sql`select job, ok, ran_at, left(detail,150) as detail from agent_runs where ran_at::date=${today} and ok=false order by ran_at`;
console.log('--- failed runs today ---');
fails.forEach(r=>console.log(r.job, r.ok, r.ran_at, r.detail));
