import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
// search raw_reviews text (as jsonb) for facility-service terms across published cafes
const terms = ['승강기 검사','승강기번호','방역입니다','준공청소','입주청소','바닥코팅','소독-방역','고장이력'];
for (const t of terms) {
  const rows = await sql`
    SELECT id, name FROM cafes
    WHERE published = true AND raw_reviews::text ILIKE ${'%' + t + '%'}
    LIMIT 5
  `;
  console.log(t, '->', rows.length, JSON.stringify(rows));
}
