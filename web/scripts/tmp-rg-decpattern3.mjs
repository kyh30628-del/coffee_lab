import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT id, title, action_type, status, team, created_at
  FROM decisions
  WHERE title ILIKE '%룰갭%' OR title ILIKE '%카페투어%' OR title ILIKE '%NEWS_BYLINE%' OR team ILIKE '%룰갭%'
  ORDER BY created_at DESC LIMIT 15
`;
console.log(JSON.stringify(rows, null, 1));
