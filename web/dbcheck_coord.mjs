import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const inbox = await sql`SELECT id,from_team,to_team,type,topic,detail,stage,status,created_at FROM coordination WHERE (to_team ILIKE '%룰갭%' OR to_team ILIKE '%품질본부%') AND status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 20`;
console.log('=== INBOX ===');
inbox.forEach(r => console.log(JSON.stringify(r)));

const allopen = await sql`SELECT id,from_team,to_team,type,topic,stage,status,created_at FROM coordination WHERE status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 30`;
console.log('=== ALL OPEN ===');
allopen.forEach(r => console.log(JSON.stringify(r)));
