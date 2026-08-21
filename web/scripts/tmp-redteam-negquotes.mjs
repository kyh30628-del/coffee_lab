import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const ids = [16941, 3183, 13789, 6314];
for (const id of ids) {
  const row = await sql`SELECT id, name, synth_reviews FROM cafes WHERE id=${id}`;
  const c = row[0];
  const reviews = typeof c.synth_reviews === 'string' ? JSON.parse(c.synth_reviews) : c.synth_reviews;
  console.log(`\n--- id${id} ${c.name} (${reviews.length} reviews) ---`);
  reviews.forEach((r, i) => {
    const q = typeof r === 'string' ? r : (r.quote || '');
    if (/실망|비추|별로|불친절|최악|다신|재방문 안/.test(q)) {
      console.log(`[${i}]`, q.slice(0, 200));
    }
  });
}
