import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

const unread = await sql`
  SELECT target_id, last_at FROM heal_attempts
  WHERE frozen_until IS NOT NULL AND frozen_until > now()
    AND job = 'sentinel.attraction'
    AND (note IS NULL OR note NOT LIKE '[사람판독%')
  ORDER BY last_at ASC LIMIT 8
`;
console.log('=== unread attraction (oldest 8) ===');
console.log(JSON.stringify(unread, null, 1));

const ids = unread.map(u=>Number(u.target_id));
const cafes = await sql`SELECT id,name,area,synth_grade,synth_count,offctx_rate,published FROM cafes WHERE id = ANY(${ids})`;
console.log('=== cafe rows ===');
console.log(JSON.stringify(cafes, null, 1));
