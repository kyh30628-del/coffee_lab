import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const inbox = await sql`SELECT id,from_team,to_team,type,topic,detail,stage,status FROM coordination WHERE status IN ('open','in_progress') AND (to_team ILIKE '%품질%' OR to_team ILIKE '%정합성%' OR to_team ILIKE '%integrity%') ORDER BY id DESC LIMIT 20`;
console.log('=== INBOX (품질/정합성) ===');
console.log(JSON.stringify(inbox, null, 1));
