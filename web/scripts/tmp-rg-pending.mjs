import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const s = await sql`SELECT id,title,team,severity,action_type,status,tier FROM decisions WHERE status='pending' ORDER BY created_at DESC LIMIT 5`;
console.log(JSON.stringify(s,null,1));
