import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

for (const id of [7202, 11117, 18295]) {
  const r = await sql`SELECT synth_reviews FROM cafes WHERE id=${id}`;
  const reviews = r[0]?.synth_reviews;
  console.log(`=== id${id} synth_reviews (${Array.isArray(reviews)?reviews.length:'?'}) ===`);
  if (Array.isArray(reviews)) {
    reviews.forEach((rv, i) => {
      const txt = typeof rv === 'string' ? rv : (rv.text || JSON.stringify(rv));
      if (/채용|모집|시급|연봉|아르바이트|알바|일자리/.test(txt)) {
        console.log(`  [${i}] AD-SUSPECT: ${txt.slice(0,150)}`);
      }
    });
  }
}
