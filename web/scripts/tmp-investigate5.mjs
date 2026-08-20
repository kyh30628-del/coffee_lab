import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

console.log('=== 인천 area 값 전체 분포 (존재하지 않는 구 이름 확인) ===');
const areas = await sql`
  SELECT area, count(*) FROM cafes WHERE area ILIKE '인천%' AND published=true GROUP BY area ORDER BY area
`;
console.log(JSON.stringify(areas, null, 2));

console.log('=== 서해구/영종구 샘플 주소 확인 ===');
const samples = await sql`
  SELECT id, name, area, address FROM cafes WHERE area IN ('인천 서해구','인천 영종구') LIMIT 10
`;
console.log(JSON.stringify(samples, null, 2));
