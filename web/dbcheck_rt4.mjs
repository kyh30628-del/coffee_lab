import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

for (const id of [7202, 11117]) {
  const r = await sql`SELECT synth_reviews FROM cafes WHERE id=${id}`;
  const reviews = r[0]?.synth_reviews;
  console.log(`=== id${id} full synth_reviews ===`);
  console.log(JSON.stringify(reviews, null, 0).slice(0, 3000));
}
