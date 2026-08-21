import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const cats = await sql`
  SELECT job,
    count(*) FILTER (WHERE note LIKE '[사람판독%') AS read,
    count(*) FILTER (WHERE note IS NULL OR note NOT LIKE '[사람판독%') AS unread,
    max(last_at) AS last_frozen_at
  FROM heal_attempts
  WHERE frozen_until IS NOT NULL AND frozen_until > now()
  GROUP BY job ORDER BY job
`;
console.log('=== frozen 항목 판독 현황(카테고리별) ===');
console.table(cats);

const c329 = await sql`SELECT id, detail FROM coordination WHERE id=329`;
console.log('=== #329 detail ===', JSON.stringify(c329, null, 1));
