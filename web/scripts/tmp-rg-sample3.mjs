import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const ids = [15117, 10537, 9090, 10293];
for (const id of ids) {
  const rows = await sql`SELECT id, name, synth_reviews FROM cafes WHERE id = ${id}`;
  const r = rows[0];
  if (!r) continue;
  console.log(`\n=== ${r.id} ${r.name} (n=${r.synth_reviews.length}) ===`);
  for (const rv of r.synth_reviews.slice(0, 10)) {
    console.log(`- ${(rv.quote||'').slice(0,130).replace(/\n/g,' ')}`);
  }
}
