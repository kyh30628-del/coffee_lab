import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const m = env.match(/DATABASE_URL=(.*)/);
const sql = neon(m[1].trim());

const cur = await sql`SELECT area, count(*) FROM cafes WHERE area IN ('인천 서해구','인천 검단구','인천 영종구','인천 제물포구') AND published=true GROUP BY area`;
console.log('current published area counts by new-gu:', JSON.stringify(cur));

const drift = await sql`
  SELECT id, name, area, address FROM cafes
  WHERE published=true AND (
    (address LIKE '%영종구%' AND area NOT LIKE '%영종구%') OR
    (address LIKE '%제물포구%' AND area NOT LIKE '%제물포구%') OR
    (address LIKE '%검단구%' AND area NOT LIKE '%검단구%') OR
    (address LIKE '%서해구%' AND area NOT LIKE '%서해구%')
  ) LIMIT 10`;
console.log('drift(address has new-gu, area not updated):', JSON.stringify(drift));

const rdrift = await sql`
  SELECT id, name, area, address FROM cafes
  WHERE published=true AND area IN ('인천 서해구','인천 검단구','인천 영종구','인천 제물포구')
  AND NOT (address LIKE '%영종구%' OR address LIKE '%제물포구%' OR address LIKE '%검단구%' OR address LIKE '%서해구%')
  LIMIT 10`;
console.log('reverse drift(area new-gu, address old):', JSON.stringify(rdrift));
