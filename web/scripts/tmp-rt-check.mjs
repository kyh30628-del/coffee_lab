import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

// coordination inbox for redteam
const inbox = await sql`SELECT id,from_team,to_team,type,topic,detail,stage,status,created_at FROM coordination WHERE to_team ILIKE '%레드팀%' OR to_team ILIKE '%품질%' AND status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 20`;
console.log('=== coordination inbox (품질/레드팀) ===');
console.log(JSON.stringify(inbox, null, 1));
