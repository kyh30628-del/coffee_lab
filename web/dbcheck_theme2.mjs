import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const ids = ['3612','2246','7198','17353','19681'];
for (const id of ids) {
  const [row] = await sql`SELECT id, name, naver_category, synth_reviews FROM cafes WHERE id = ${id}`;
  console.log(`\n=== ${row.id} ${row.name} (${row.naver_category}) ===`);
  const revs = row.synth_reviews || [];
  revs.forEach((r, i) => console.log(`[${i}] trust=${r.trust} score=${r.score} :: ${(r.quote||'').slice(0,120)}`));
}
