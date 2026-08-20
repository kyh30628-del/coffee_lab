import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const m = env.match(/DATABASE_URL=(.*)/);
const sql = neon(m[1].trim());

const [d1] = await sql`SELECT count(*) c FROM cafes WHERE published=true AND (
    (address LIKE '%영종구%' AND area NOT LIKE '%영종구%') OR
    (address LIKE '%제물포구%' AND area NOT LIKE '%제물포구%') OR
    (address LIKE '%검단구%' AND area NOT LIKE '%검단구%') OR
    (address LIKE '%서해구%' AND area NOT LIKE '%서해구%')
  )`;
console.log('forward drift count (address new-gu, area mismatched):', d1.c);

const [d2] = await sql`SELECT count(*) c FROM cafes
  WHERE published=true AND area IN ('인천 서해구','인천 검단구','인천 영종구','인천 제물포구')
  AND NOT (address LIKE '%영종구%' OR address LIKE '%제물포구%' OR address LIKE '%검단구%' OR address LIKE '%서해구%')`;
console.log('reverse drift count (area new-gu, address old/no new-gu token):', d2.c);

// breakdown reverse drift by area
const d2b = await sql`SELECT area, count(*) FROM cafes
  WHERE published=true AND area IN ('인천 서해구','인천 검단구','인천 영종구','인천 제물포구')
  AND NOT (address LIKE '%영종구%' OR address LIKE '%제물포구%' OR address LIKE '%검단구%' OR address LIKE '%서해구%')
  GROUP BY area`;
console.log(JSON.stringify(d2b));

// how many have address containing "서해구" total (to check if 서해구 is a bogus/nonexistent token entirely - maybe misparse of 서구+해안 something)
const tot = await sql`SELECT count(*) c FROM cafes WHERE address LIKE '%서해구%'`;
console.log('total address contains 서해구:', tot[0].c);
