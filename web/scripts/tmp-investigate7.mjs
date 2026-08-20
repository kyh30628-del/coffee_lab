import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

console.log('=== 동일 좌표(소수6자리) 다른 이름 군집 (오등록 의심) ===');
const dup = await sql`
  SELECT round(lat::numeric,5) la, round(lng::numeric,5) lo, count(*) cnt, array_agg(name) names, array_agg(id) ids
  FROM cafes WHERE published=true
  GROUP BY la, lo
  HAVING count(*) > 1
  ORDER BY cnt DESC LIMIT 15
`;
console.log(JSON.stringify(dup, null, 2));
