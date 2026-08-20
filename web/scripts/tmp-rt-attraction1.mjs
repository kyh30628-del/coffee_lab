import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

const cats = await sql`
  SELECT job,
    count(*) FILTER (WHERE note LIKE '[사람판독%') AS read,
    count(*) FILTER (WHERE note IS NULL OR note NOT LIKE '[사람판독%') AS unread
  FROM heal_attempts
  WHERE frozen_until IS NOT NULL AND frozen_until > now()
  GROUP BY job ORDER BY job
`;
console.log(JSON.stringify(cats, null, 2));

// unread attraction targets
const unread = await sql`
  SELECT target_id, job, created_at FROM heal_attempts
  WHERE frozen_until IS NOT NULL AND frozen_until > now()
    AND job = 'sentinel.attraction'
    AND (note IS NULL OR note NOT LIKE '[사람판독%')
  ORDER BY created_at ASC LIMIT 8
`;
console.log('=== unread attraction sample (oldest 8) ===');
console.log(JSON.stringify(unread, null, 1));
