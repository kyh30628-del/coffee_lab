import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const ids = [4621, 18293, 10879, 16230, 12333, 17643, 6844];
for (const id of ids) {
  const rows = await sql`SELECT id, name, synth_reviews FROM cafes WHERE id = ${id}`;
  const c = rows[0];
  if (!c) continue;
  const reviews = (c.synth_reviews || []).slice(0, 6).map(r => (typeof r === 'string' ? r : (r.text || JSON.stringify(r))).slice(0, 90));
  console.log(`\n=== id${c.id} ${c.name} ===`);
  reviews.forEach((r,i)=>console.log(`${i+1}. ${r}`));
}
