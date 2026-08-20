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

const lastBatch = await sql`SELECT max(last_at) as last_readback FROM heal_attempts WHERE note LIKE '[사람판독%'`;
console.log('마지막 판독 태그 시각:', JSON.stringify(lastBatch));

// today's newly frozen items note status
const refs = [3537,1255,2597,2598,4170,6299,8194,8432,11014,10321,15407,17453,19192,18089,20101,393,495,19257,5114,5833,12826];
const todayItems = await sql`
  SELECT job, target_id, note, last_at, frozen_until FROM heal_attempts
  WHERE target_id = ANY(${refs}) AND frozen_until > now()
  ORDER BY job, target_id
`;
console.log('=== 오늘 트리거된 개별항목 ===');
console.table(todayItems);
