import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

console.log('=== decisions recent 30h ===');
console.log(await sql`SELECT id, tier, status, left(title,70) t, team, created_at, decided_at FROM decisions WHERE created_at > now() - interval '30 hours' ORDER BY id DESC LIMIT 25`);

console.log('=== #757/#758/#762 status ===');
console.log(await sql`SELECT id, tier, status, left(title,90) t, created_at, decided_at, left(result,150) result FROM decisions WHERE id IN (757,758,762)`);

console.log('=== agent_runs today non-success ===');
console.log(await sql`SELECT job, status, started_at, left(error,100) err FROM agent_runs WHERE started_at > now() - interval '24 hours' AND status != 'success' ORDER BY started_at DESC LIMIT 20`);
