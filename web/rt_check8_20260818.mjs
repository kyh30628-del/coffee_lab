import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

for (const id of [1746, 5557, 8739, 14321]) {
  const r = await sql`SELECT id,name,address,synth_reviews FROM cafes WHERE id=${id}`;
  const c = r[0];
  const revs = typeof c.synth_reviews === 'string' ? JSON.parse(c.synth_reviews) : c.synth_reviews;
  const hasRooftop = (revs||[]).some(rv => (rv.quote||'').includes('루프탑') || (rv.quote||'').includes('옥상'));
  console.log(`${c.id} ${c.name} | addr=${c.address} | any review mentions 루프탑/옥상: ${hasRooftop}`);
  if (!hasRooftop) (revs||[]).forEach((rv,i)=>console.log('  ',i, (rv.quote||'').slice(0,80)));
}
