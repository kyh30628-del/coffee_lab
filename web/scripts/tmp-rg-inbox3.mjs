import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const inbox = await sql`SELECT id,from_team,to_team,type,topic,detail,stage,status,created_at FROM coordination WHERE to_team ILIKE '%룰갭%' AND status IN ('open','in_progress') ORDER BY created_at`;
console.log("=== INBOX to 룰갭발굴팀 ===");
console.log(JSON.stringify(inbox, null, 1));
const mine = await sql`SELECT id,from_team,to_team,type,topic,stage,status,created_at FROM coordination WHERE from_team ILIKE '%룰갭%' AND status IN ('open','in_progress') ORDER BY created_at`;
console.log("=== MY outgoing open ===");
console.log(JSON.stringify(mine, null, 1));
