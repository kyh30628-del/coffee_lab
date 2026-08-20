import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const m = env.match(/DATABASE_URL=(.+)/);
const sql = neon(m[1].trim());

console.log('--- D. 같은 photo_url 여러 카페 공유 ---');
console.log(await sql`
  SELECT photo_url, count(*) c, array_agg(id) ids, array_agg(name) names
  FROM cafes WHERE published=true AND photo_url IS NOT NULL AND photo_url != ''
  GROUP BY photo_url HAVING count(*) > 1 LIMIT 10
`);

console.log('--- E. 같은 주소, 다른 이름 (다른 카페상세로 오등록 의심) ---');
console.log(await sql`
  SELECT address, count(*) c, array_agg(id) ids, array_agg(DISTINCT name) names
  FROM cafes WHERE published=true AND address IS NOT NULL AND address != ''
  GROUP BY address HAVING count(*) > 1 AND count(DISTINCT name) > 1 LIMIT 10
`);

console.log('--- F. place_id 중복(동일 네이버 place가 여러 row) ---');
console.log(await sql`
  SELECT place_id, count(*) c, array_agg(id) ids, array_agg(name) names, array_agg(published) pubs
  FROM cafes WHERE place_id IS NOT NULL
  GROUP BY place_id HAVING count(*) > 1 LIMIT 10
`);
