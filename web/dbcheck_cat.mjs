import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

// naver_category values that mention non-pure-coffee business types, among published high-offctx cafes
const cats = await sql`
  SELECT naver_category, count(*) n
  FROM cafes
  WHERE published = true AND offctx_rate > 0.1
  GROUP BY naver_category
  ORDER BY n DESC
  LIMIT 60
`;
console.log('=== naver_category dist (published, offctx_rate>0.1) ===');
cats.forEach(r => console.log(r.n, r.naver_category));
