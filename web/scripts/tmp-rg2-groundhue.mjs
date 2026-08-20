import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const rows = await sql`SELECT id, name, area, synth_grade, synth_reviews, synth_count, offctx_rate FROM cafes WHERE id = 18246`;
const r = rows[0];
console.log(`${r.id} ${r.name} grade=${r.synth_grade} count=${r.synth_count} offctx_rate=${r.offctx_rate}`);
console.log('--- DISPLAYED synth_reviews ---');
for (const rv of r.synth_reviews) {
  console.log(`- ${(rv.quote||'').slice(0,150).replace(/\n/g,' ')}`);
}
