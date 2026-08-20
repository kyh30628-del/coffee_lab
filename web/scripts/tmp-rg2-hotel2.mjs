import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const ids = [1316, 9634, 10537, 15117, 6528, 8558, 1780];
for (const id of ids) {
  const rows = await sql`SELECT id, name, area, synth_reviews FROM cafes WHERE id = ${id}`;
  const r = rows[0];
  if (!r) continue;
  const offctxRevs = (r.synth_reviews||[]).filter(rv => rv.offctx === true);
  console.log(`\n=== ${r.id} ${r.name} (${r.area}) — offctx quotes ${offctxRevs.length}/${r.synth_reviews.length} ===`);
  for (const rv of offctxRevs.slice(0, 4)) {
    console.log(`- ${(rv.quote||'').slice(0,150).replace(/\n/g,' ')}`);
  }
}
