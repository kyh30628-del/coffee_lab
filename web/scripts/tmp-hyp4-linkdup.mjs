import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const dup = await sql`
  SELECT link, count(distinct cafe_id) cafe_cnt, array_agg(DISTINCT cafe_id) ids
  FROM cafes, LATERAL jsonb_to_recordset(synth_reviews) AS x(link text)
  CROSS JOIN LATERAL (SELECT id AS cafe_id) c
  WHERE published=true AND synth_reviews IS NOT NULL
  GROUP BY link
  HAVING count(distinct cafe_id) >= 2
  LIMIT 15
`;
console.log(JSON.stringify(dup, null, 1));
