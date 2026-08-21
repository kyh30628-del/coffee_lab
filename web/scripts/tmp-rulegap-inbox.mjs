import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const coord = await sql`
  SELECT id, from_team, to_team, type, topic, stage, status, created_at
  FROM coordination
  WHERE (to_team ILIKE '%룰갭%' OR to_team ILIKE '%품질본부%' OR from_team ILIKE '%rulegap%' OR from_team ILIKE '%룰갭%')
  ORDER BY created_at DESC LIMIT 15
`;
console.log('---coordination(mine)---');
console.log(JSON.stringify(coord, null, 1));
const dec = await sql`
  SELECT id, status, action_type, left(topic,60) as topic, created_at
  FROM decisions WHERE topic ILIKE '%룰갭%' ORDER BY created_at DESC LIMIT 10
`;
console.log('---decisions rulegap---');
console.log(JSON.stringify(dec, null, 1));
