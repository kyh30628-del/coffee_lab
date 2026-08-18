import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const inbox = await sql`SELECT id,from_team,to_team,type,topic,detail,stage,status,created_at FROM coordination WHERE (to_team ILIKE '%품질%' OR to_team ILIKE '%검증심사%' OR to_team ILIKE '%정합성%') AND status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 20`;
console.log('=== MY INBOX ===');
inbox.forEach(r => console.log(JSON.stringify(r)));
console.log('count:', inbox.length);
