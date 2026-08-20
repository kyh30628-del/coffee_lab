import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

console.log('=== 1. char_scores outlier (한 축이 비현실적) ===');
const cs = await sql`
  SELECT id, name, char_scores
  FROM cafes
  WHERE published = true AND char_scores IS NOT NULL
  LIMIT 5000
`;
// parse and check axis spread
let outliers = [];
for (const row of cs) {
  let obj = row.char_scores;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { continue; } }
  if (!obj || typeof obj !== 'object') continue;
  const vals = Object.values(obj).filter(v => typeof v === 'number');
  if (vals.length < 2) continue;
  const max = Math.max(...vals), min = Math.min(...vals);
  if (max >= 9.5 && min <= 1.5) outliers.push({id: row.id, name: row.name, scores: obj});
  else if (max - min >= 8) outliers.push({id: row.id, name: row.name, scores: obj});
}
console.log('outlier count:', outliers.length);
console.log(JSON.stringify(outliers.slice(0,10), null, 2));

console.log('=== 2. review_dates 미래 날짜 ===');
const fut = await sql`
  SELECT id, name, review_dates
  FROM cafes
  WHERE published = true AND review_dates IS NOT NULL
  LIMIT 3000
`;
let futureCafes = [];
const now = new Date('2026-08-20');
for (const row of fut) {
  let dates = row.review_dates;
  if (typeof dates === 'string') { try { dates = JSON.parse(dates); } catch { continue; } }
  if (!Array.isArray(dates)) continue;
  for (const d of dates) {
    const dt = new Date(d);
    if (!isNaN(dt) && dt > now) { futureCafes.push({id: row.id, name: row.name, date: d}); break; }
  }
}
console.log('future date cafes:', futureCafes.length);
console.log(JSON.stringify(futureCafes.slice(0,10), null, 2));

console.log('=== 3. 이름이 일반명사/문장(공백 다수·조사 포함) ===');
const names = await sql`
  SELECT id, name, area, synth_grade
  FROM cafes
  WHERE published = true
    AND (name ~ '[가-힣]+\s+[가-힣]+\s+[가-힣]+' OR name ~ '(습니다|해요|이에요|맛있|추천)')
  LIMIT 20
`;
console.log('suspicious sentence-like names:', names.length);
console.log(JSON.stringify(names, null, 2));
