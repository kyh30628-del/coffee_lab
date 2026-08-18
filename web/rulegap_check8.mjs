import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const ids = [19744, 18761];
const rows = await sql`SELECT id, name, area, synth_reviews FROM cafes WHERE id = ANY(${ids})`;
for (const r of rows) {
  console.log(`\n=== id${r.id} ${r.name} (${r.area}) ===`);
  const revs = r.synth_reviews || [];
  revs.forEach((rv, i) => {
    const src = (rv.source || '').slice(0, 50);
    const q = (rv.quote || '').slice(0, 100);
    console.log(`[${i}] trust=${rv.trust} score=${rv.score} src="${src}" q="${q}"`);
  });
}
