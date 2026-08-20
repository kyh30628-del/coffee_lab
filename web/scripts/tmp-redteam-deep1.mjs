import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

for (const id of ['1316', '6659', '247']) {
  const c = await sql`SELECT id, name, area, address, synth_identity, synth_grade, synth_count, offctx_rate, char_scores FROM cafes WHERE id=${id}`;
  console.log('CAFE', id, JSON.stringify(c[0]));
  const rv = await sql`SELECT synth_reviews FROM cafes WHERE id=${id}`;
  const reviews = rv[0]?.synth_reviews;
  let arr = reviews;
  if (typeof reviews === 'string') { try { arr = JSON.parse(reviews); } catch {} }
  if (Array.isArray(arr)) {
    console.log('REVIEW_SAMPLE', id, JSON.stringify(arr.slice(0, 4)));
  } else {
    console.log('REVIEW_RAW_TYPE', id, typeof reviews, JSON.stringify(reviews).slice(0, 500));
  }
}
