import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const m = env.match(/DATABASE_URL=(.*)/);
const sql = neon(m[1].trim());

const drift = await sql`
  SELECT id, name, area, address, created_at FROM cafes
  WHERE published=true AND (
    (address LIKE '%영종구%' AND area NOT LIKE '%영종구%') OR
    (address LIKE '%제물포구%' AND area NOT LIKE '%제물포구%') OR
    (address LIKE '%검단구%' AND area NOT LIKE '%검단구%') OR
    (address LIKE '%서해구%' AND area NOT LIKE '%서해구%')
  ) ORDER BY created_at DESC`;
console.log(JSON.stringify(drift, null, 1));
