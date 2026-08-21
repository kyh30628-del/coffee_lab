import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const r2 = await sql`SELECT synth_reviews FROM cafes WHERE id=19003`;
console.log('우상향 ref review full:', JSON.stringify(r2[0].synth_reviews.find(r=>r.trust==='reference'), null, 1));
const r3 = await sql`SELECT synth_reviews FROM cafes WHERE id=1520`;
console.log('톤앤매너 ref review full:', JSON.stringify(r3[0].synth_reviews.find(r=>r.trust==='reference'), null, 1));
