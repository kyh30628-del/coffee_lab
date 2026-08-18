import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

for (const id of [10537, 1316]) {
  const r = await sql`SELECT id,name,synth_reviews FROM cafes WHERE id=${id}`;
  const c = r[0];
  console.log(`\n=== ${c.id} ${c.name} ===`);
  const revs = typeof c.synth_reviews === 'string' ? JSON.parse(c.synth_reviews) : c.synth_reviews;
  (revs||[]).forEach((rv,i)=>console.log(i, JSON.stringify(rv).slice(0,300)));
}
