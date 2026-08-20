import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const daily = await sql`
  SELECT to_char((created_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD (Dy)') AS d, count(DISTINCT anon_id) AS cnt
  FROM user_consents
  WHERE src='naver' AND NOT COALESCE(internal,false)
    AND created_at >= now() - interval '22 days'
  GROUP BY 1 ORDER BY 1`;
console.log('DAILY22:', JSON.stringify(daily, null, 0));
