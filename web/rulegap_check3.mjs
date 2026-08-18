import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const ids = [6478, 8784, 9683, 10125, 16913, 18724, 19003];
const rows = await sql`SELECT id, name, area, synth_reviews FROM cafes WHERE id = ANY(${ids})`;
for (const r of rows) {
  console.log(`\n=== id${r.id} ${r.name} (${r.area}) ===`);
  const revs = r.synth_reviews || [];
  revs.forEach((rv, i) => {
    const title = (rv.title || '').slice(0, 70);
    const body = (rv.body || rv.text || '').slice(0, 90);
    console.log(`[${i}] trust=${rv.trust} score=${rv.score} title="${title}" body="${body}"`);
  });
}
