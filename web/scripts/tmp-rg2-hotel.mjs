import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const ids = [1316, 9634, 10537, 15117, 6528];
for (const id of ids) {
  const cafe = await sql`SELECT id, name, area FROM cafes WHERE id = ${id}`;
  const revs = await sql`SELECT quote, offctx FROM synth_reviews WHERE cafe_id = ${id} AND offctx = true LIMIT 4`;
  console.log(`\n=== ${id} ${cafe[0]?.name} (${cafe[0]?.area}) — offctx=true quotes (${revs.length}) ===`);
  revs.forEach(r => console.log('- ' + (r.quote||'').slice(0,150)));
}
