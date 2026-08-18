import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const inbox = await sql`SELECT id,from_team,to_team,type,topic,detail,stage,status,created_at FROM coordination WHERE (to_team ILIKE '%경험%' OR to_team ILIKE '%검색%' OR to_team ILIKE '%품질본부%') AND status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 20`;
console.log('=== INBOX (경험/검색/품질본부) ===');
inbox.forEach(r => console.log(JSON.stringify(r)));

const decisions = await sql`SELECT id,status,action_type,title,created_at FROM decisions WHERE title ILIKE '%검색%' OR title ILIKE '%franchise%' OR title ILIKE '%프랜차이즈%' OR title ILIKE '%727%' ORDER BY created_at DESC LIMIT 10`;
console.log('=== 관련 DECISIONS ===');
decisions.forEach(r => console.log(JSON.stringify(r)));
