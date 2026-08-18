import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

console.log('=== agent_runs today ok=false ===');
console.log(await sql`SELECT job, ok, ran_at, left(detail,120) d FROM agent_runs WHERE ran_at > now() - interval '24 hours' AND ok = false ORDER BY ran_at DESC LIMIT 20`);

console.log('=== pending decisions any tier ===');
console.log(await sql`SELECT id, tier, status, left(title,70) t, team, created_at FROM decisions WHERE status='pending' ORDER BY id DESC LIMIT 15`);

console.log('=== 4x/day gate check: audit-watch/dev-pipeline/dev-deploy today times ===');
console.log(await sql`SELECT job, ran_at FROM agent_runs WHERE job IN ('audit-watch','dev-pipeline','dev-deploy') AND ran_at > now() - interval '24 hours' ORDER BY job, ran_at`);
