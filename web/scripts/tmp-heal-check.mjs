import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

// category-level read/unread breakdown for frozen (2+ attempts, still frozen) items
const cats = await sql`
  SELECT job,
    count(*) FILTER (WHERE note LIKE '[사람판독%') AS read,
    count(*) FILTER (WHERE note IS NULL OR note NOT LIKE '[사람판독%') AS unread,
    max(created_at) FILTER (WHERE note LIKE '[사람판독%') AS last_read_at
  FROM heal_attempts
  WHERE frozen_until IS NOT NULL AND frozen_until > now()
  GROUP BY job ORDER BY job
`;
console.log('=== frozen 항목 판독 현황(카테고리별) ===');
console.log(JSON.stringify(cats, null, 2));

// today's newly frozen refs from triggers
const refs = ['generic-term#3537','attraction#1255','attraction#2597','attraction#2598','attraction#4170','attraction#6299','attraction#8194','attraction#8432','attraction#11014','attraction#10321','attraction#15407','attraction#17453','attraction#19192','attraction#18089','attraction#20101','attraction#393','attraction#495','generic-term#19257','generic-term#5114','generic-term#5833','generic-term#12826'];
console.log('=== 마지막 판독배치 시각 ===');
const lastBatch = await sql`SELECT max(created_at) as last_readback FROM heal_attempts WHERE note LIKE '[사람판독%'`;
console.log(JSON.stringify(lastBatch));
