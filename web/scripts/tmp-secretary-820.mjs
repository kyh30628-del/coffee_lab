import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const fails = await sql`SELECT job, ok, ran_at, detail FROM agent_runs WHERE ok = false AND ran_at > now() - interval '24 hours' ORDER BY ran_at DESC LIMIT 20`;
console.log('FAILS_24H:', JSON.stringify(fails));

const runsToday = await sql`SELECT job, count(*) c FROM agent_runs WHERE ran_at > now() - interval '10 hours' GROUP BY 1 ORDER BY 1`;
console.log('RUNS_10H:', JSON.stringify(runsToday));

const decToday = await sql`SELECT id, status, action_type, tier, team, left(title,70) t, created_at FROM decisions WHERE created_at > (now() at time zone 'Asia/Seoul')::date AT TIME ZONE 'Asia/Seoul' ORDER BY id DESC LIMIT 30`;
console.log('DEC_TODAY:', JSON.stringify(decToday));

const decPending = await sql`SELECT id, status, tier, left(title,60) t, created_at FROM decisions WHERE status IN ('pending','approved') ORDER BY tier, created_at LIMIT 30`;
console.log('DEC_PENDING:', JSON.stringify(decPending));

const coordToday = await sql`SELECT id, status, left(subject,60) s, from_team, to_team, created_at FROM coordination WHERE created_at > (now() at time zone 'Asia/Seoul')::date AT TIME ZONE 'Asia/Seoul' ORDER BY id DESC LIMIT 20`;
console.log('COORD_TODAY:', JSON.stringify(coordToday));
