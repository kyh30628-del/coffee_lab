import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

console.log('=== coordination open ===');
console.log(await sql`SELECT id, stage, left(detail,90) d, from_team, to_team, created_at FROM coordination WHERE stage NOT IN ('완료','종결','resolved','closed') ORDER BY id DESC LIMIT 15`);

console.log('=== decisions L2/L3 pending or recent today ===');
console.log(await sql`SELECT id, level, status, left(title,70) t, owner_team, created_at, decided_at FROM decisions WHERE created_at > now() - interval '30 hours' ORDER BY id DESC LIMIT 25`);

console.log('=== #757/#758/#762 status ===');
console.log(await sql`SELECT id, level, status, left(title,90) t, created_at, decided_at, left(note,150) note FROM decisions WHERE id IN (757,758,762)`);

console.log('=== agent_runs today failures ===');
console.log(await sql`SELECT job, status, started_at, left(error,100) err FROM agent_runs WHERE started_at > now() - interval '24 hours' AND status != 'success' ORDER BY started_at DESC LIMIT 20`);

console.log('=== audit_flags open ===');
console.log(await sql`SELECT count(*) FROM audit_flags WHERE resolved_at IS NULL`);
