import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const rows = await sql`SELECT id, title, status, team, action_type, created_at FROM decisions WHERE title ILIKE '%판독%' OR title ILIKE '%heal_attempts%' OR title ILIKE '%하네스%' ORDER BY id DESC LIMIT 10`;
console.table(rows);
// also check history of frozen counts trend by checking distinct frozen batches
const trend = await sql`
  SELECT job, date_trunc('day', last_at) AS d, count(*) c
  FROM heal_attempts WHERE frozen_until > now() - interval '10 days'
  GROUP BY job, d ORDER BY job, d
`;
console.log('=== 일별 신규동결 추이 ===');
console.table(trend);
