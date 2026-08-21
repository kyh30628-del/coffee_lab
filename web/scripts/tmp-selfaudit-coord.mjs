import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
for (const line of fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const sql = neon(process.env.DATABASE_URL);

const now = await sql`SELECT now() as now`;
console.log("NOW:", now[0].now);

const coord = await sql`SELECT id, topic, detail, from_team, to_team, status, stage, created_at, due_at, escalated_at, resolved_at, resolution FROM coordination WHERE id IN (325,326,327,328) ORDER BY id`;
console.log("COORD:", JSON.stringify(coord, null, 2));

const cafe = await sql`SELECT id, name, address, area, published, closure_misses, updated_at FROM cafes WHERE id = 11853`;
console.log("CAFE11853:", JSON.stringify(cafe, null, 2));
