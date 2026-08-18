import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const exclude = [9294,19681,7368,1992,18064,20145];
const rows = await sql`
  SELECT id, name, area, naver_category, offctx_rate
  FROM cafes
  WHERE published = true AND offctx_rate > 0.12
    AND id != ALL(${exclude})
  ORDER BY offctx_rate DESC
  LIMIT 30
`;
console.log('=== TOP OFFCTX CANDIDATES ===');
rows.forEach(r => console.log(r.id, '|', r.name, '|', r.area, '|', r.naver_category, '|', r.offctx_rate));
