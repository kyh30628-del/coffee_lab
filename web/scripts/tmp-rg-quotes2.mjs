import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const ids = [1780, 10537, 2010, 19003, 5003, 1520, 12302];
for (const id of ids) {
  const rows = await sql`SELECT id, name, address, synth_reviews FROM cafes WHERE id = ${id}`;
  const c = rows[0];
  if (!c) continue;
  console.log(`\n=== id${c.id} ${c.name} | ${c.address} ===`);
  (c.synth_reviews || []).slice(0,8).forEach((r,i)=>console.log(`${i+1}. [${r.trust}] ${(r.quote||'').slice(0,110)}`));
}
