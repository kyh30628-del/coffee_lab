import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const rows = await sql`SELECT id,name,area,dong,synth_reviews FROM cafes WHERE id IN (13050,13615,1453)`;
for (const r of rows) {
  console.log(`=== id${r.id} ${r.name} (${r.area}/${r.dong}) ===`);
  for (const rv of (r.synth_reviews||[])) console.log(`  · ${rv.quote}`);
}
