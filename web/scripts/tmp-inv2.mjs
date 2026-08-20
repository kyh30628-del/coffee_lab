import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const m = env.match(/DATABASE_URL=(.*)/);
const sql = neon(m[1].trim());

const d = await sql`SELECT * FROM decisions WHERE id=487`;
console.log(JSON.stringify(d,null,1));

// also verify actual current data state matches decision (backfill really applied consistently)
const cur = await sql`SELECT area, count(*) FROM cafes WHERE area IN ('인천 서해구','인천 검단구','인천 영종구','인천 제물포구') AND status='published' GROUP BY area`;
console.log('current area counts', JSON.stringify(cur));
