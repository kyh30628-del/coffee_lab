import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

console.log('=== address 필드 자체에 가공구명(서해구/검단구/영종구/제물포구) 포함 건수 ===');
const bad = await sql`
  SELECT area, count(*) FROM cafes
  WHERE published=true AND (address ILIKE '%서해구%' OR address ILIKE '%검단구%' OR address ILIKE '%영종구%' OR address ILIKE '%제물포구%')
  GROUP BY area ORDER BY count(*) DESC
`;
console.log(JSON.stringify(bad, null, 2));

console.log('=== dong 필드도 확인 ===');
const dongcheck = await sql`
  SELECT dong, area, count(*) FROM cafes WHERE published=true AND area IN ('인천 서해구','인천 검단구','인천 영종구','인천 제물포구') GROUP BY dong, area ORDER BY count(*) DESC LIMIT 20
`;
console.log(JSON.stringify(dongcheck, null, 2));

console.log('=== 다른 지역(서울/경기)에도 이런 가공구명 패턴 있는지 - area 전체 유니크값 중 표준 행정구 아닌 것 스캔 ===');
const allAreas = await sql`SELECT area, count(*) FROM cafes WHERE published=true GROUP BY area ORDER BY area`;
console.log(allAreas.map(a=>a.area).join(' | '));
