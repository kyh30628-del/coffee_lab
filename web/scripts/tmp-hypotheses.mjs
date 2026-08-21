import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

// H1: future review_dates (after today 2026-08-21)
const futureDates = await sql`
  SELECT id, name, r AS bad_date
  FROM cafes, LATERAL jsonb_array_elements_text(review_dates) AS r
  WHERE published=true AND review_dates IS NOT NULL
    AND to_date(r, 'YYYY.MM.DD') > DATE '2026-08-21'
  LIMIT 15
`;
console.log('=== H1 future review dates ===', futureDates.length);
console.log(JSON.stringify(futureDates));

// H2: duplicate exact coordinates among published cafes with different names (not already same address dup)
const coordDup = await sql`
  SELECT lat, lng, count(*) cnt, array_agg(id) ids, array_agg(name) names, array_agg(address) addrs
  FROM cafes
  WHERE published=true AND lat IS NOT NULL AND lng IS NOT NULL
  GROUP BY lat, lng
  HAVING count(*) >= 3
  ORDER BY cnt DESC
  LIMIT 10
`;
console.log('=== H2 same-exact-coord clusters (>=3) ===', coordDup.length);
console.log(JSON.stringify(coordDup, null, 1));

// H3: phone reused across different-name cafes
const phoneDup = await sql`
  SELECT phone, count(distinct name) namecnt, count(*) cnt, array_agg(id) ids, array_agg(name) names
  FROM cafes
  WHERE published=true AND phone IS NOT NULL AND phone <> ''
  GROUP BY phone
  HAVING count(distinct name) >= 2
  ORDER BY cnt DESC
  LIMIT 10
`;
console.log('=== H3 phone reused across different names ===', phoneDup.length);
console.log(JSON.stringify(phoneDup, null, 1));
