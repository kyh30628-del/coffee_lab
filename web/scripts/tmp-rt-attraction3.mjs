import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);
const ids = [849,3103,4254,4733,6100,8299,18919,19777];
for (const id of ids) {
  const r = await sql`SELECT synth_reviews FROM cafes WHERE id=${id}`;
  const revs = r[0]?.synth_reviews || [];
  const quotes = revs.slice(0,2).map(x=>x.quote?.slice(0,80));
  console.log(id, JSON.stringify(quotes));
}
