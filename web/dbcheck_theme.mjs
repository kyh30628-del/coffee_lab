import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const rows = await sql`
  SELECT id, name, naver_category, offctx_rate, synth_count, area
  FROM cafes
  WHERE published = true AND offctx_rate > 0.1
    AND naver_category IN ('테마카페','갤러리카페','한방카페','다방','떡카페','음식점>카페,디저트>테마카페')
  ORDER BY offctx_rate DESC
`;
console.log(JSON.stringify(rows, null, 1));
