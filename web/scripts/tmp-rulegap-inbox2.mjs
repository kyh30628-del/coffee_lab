import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='decisions'`;
console.log('decisions cols:', cols.map(c=>c.column_name).join(','));
const open = await sql`
  SELECT id, from_team, to_team, type, topic, stage, status, detail, created_at
  FROM coordination WHERE status IN ('open','in_progress') ORDER BY created_at ASC LIMIT 20
`;
console.log('---open coordination (all)---');
console.log(JSON.stringify(open, null, 1));
