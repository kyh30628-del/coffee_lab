import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

// coordination inbox for me
const inbox = await sql`SELECT id,from_team,to_team,type,topic,detail,stage,status FROM coordination WHERE to_team ILIKE '%품질%' OR to_team ILIKE '%정합성%' OR to_team ILIKE '%검증%' ORDER BY id DESC LIMIT 15`;
console.log('=== INBOX ===');
console.log(JSON.stringify(inbox, null, 1));

// status of #317 (my own prior handoff)
const c317 = await sql`SELECT id,from_team,to_team,type,topic,detail,stage,status,resolution FROM coordination WHERE id=317`;
console.log('=== #317 ===');
console.log(JSON.stringify(c317, null, 1));
