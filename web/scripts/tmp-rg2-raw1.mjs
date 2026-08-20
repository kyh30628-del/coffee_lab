import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const ids = [12333, 2010, 18246, 17643, 6659];
for (const id of ids) {
  const rows = await sql`SELECT id, name, area, raw_reviews FROM cafes WHERE id = ${id}`;
  const r = rows[0];
  if (!r) continue;
  const raw = r.raw_reviews || [];
  console.log(`\n=== ${r.id} ${r.name} (${r.area}) — raw n=${raw.length} ===`);
  // print quotes that look offtopic-ish (heuristic: sample first 8)
  for (const rv of raw.slice(0, 10)) {
    console.log(`- ${(rv.quote||rv.text||'').slice(0,120).replace(/\n/g,' ')}`);
  }
}
