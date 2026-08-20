import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const ids = [9634, 10125, 18293, 19003, 1380, 6478, 18724, 6528];
for (const id of ids) {
  const rows = await sql`SELECT id, name, synth_reviews FROM cafes WHERE id = ${id}`;
  const r = rows[0];
  if (!r) continue;
  console.log(`\n=== ${r.id} ${r.name} ===`);
  for (const rv of r.synth_reviews) {
    console.log(`- ${(rv.quote||'').slice(0,140).replace(/\n/g,' ')}`);
  }
}
