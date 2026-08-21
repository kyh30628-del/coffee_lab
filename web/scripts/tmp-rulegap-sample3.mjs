import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const ids = ['4263','4621','18293','10537','1780','6478','18724'];
for (const id of ids) {
  const rows = await sql`SELECT id, name, naver_category, address, raw_reviews FROM cafes WHERE id = ${id}`;
  const r = rows[0];
  if (!r) continue;
  console.log('=====', r.id, r.name, '|', r.naver_category, '|', r.address);
  let reviews = r.raw_reviews;
  if (typeof reviews === 'string') { try { reviews = JSON.parse(reviews); } catch {} }
  if (Array.isArray(reviews)) {
    reviews.slice(0, 8).forEach((rv, i) => {
      const text = (rv.text || rv.content || rv.review || JSON.stringify(rv)).toString().slice(0, 150);
      console.log(`  [${i}] ${text}`);
    });
  } else {
    console.log('  (no array reviews)', JSON.stringify(reviews).slice(0,200));
  }
}
