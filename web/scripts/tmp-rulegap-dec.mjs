import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT id, status, action_type, title, decided_at, created_at FROM decisions
  WHERE title ILIKE '%두레%' OR title ILIKE '%커피마을%' OR detail ILIKE '%11853%'
  ORDER BY created_at DESC LIMIT 5
`;
console.log(JSON.stringify(rows, null, 1));
