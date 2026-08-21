import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const ids = [2729, 247, 8558];
for (const id of ids) {
  const rows = await sql`SELECT id, name, address, synth_reviews FROM cafes WHERE id = ${id}`;
  const c = rows[0];
  if (!c) continue;
  console.log(`\n=== id${c.id} ${c.name} | ${c.address} ===`);
  (c.synth_reviews || []).forEach((r,i)=>console.log(`${i+1}. [${r.trust}] ${(r.quote||'').slice(0,120)}`));
}
// full quotes for 우상향/톤앤매너 reference reviews
const r2 = await sql`SELECT synth_reviews FROM cafes WHERE id=19003`;
console.log('\n=== 우상향 full ref quote ===');
console.log(r2[0].synth_reviews.filter(r=>r.trust==='reference').map(r=>r.quote));
const r3 = await sql`SELECT synth_reviews FROM cafes WHERE id=1520`;
console.log('\n=== 톤앤매너 full ref quote ===');
console.log(r3[0].synth_reviews.filter(r=>r.trust==='reference').map(r=>r.quote));
