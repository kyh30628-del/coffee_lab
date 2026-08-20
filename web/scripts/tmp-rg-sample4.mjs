import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const ids = [8558, 4263, 19707, 2729, 16486, 16230, 1780];
for (const id of ids) {
  const rows = await sql`SELECT id, name, synth_reviews FROM cafes WHERE id = ${id}`;
  const r = rows[0];
  if (!r) continue;
  console.log(`\n=== ${r.id} ${r.name} (n=${r.synth_reviews.length}) ===`);
  for (const rv of r.synth_reviews.slice(0, 6)) {
    console.log(`- ${(rv.quote||'').slice(0,120).replace(/\n/g,' ')}`);
  }
}
