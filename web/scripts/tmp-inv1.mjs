import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const m = env.match(/DATABASE_URL=(.*)/);
const sql = neon(m[1].trim());

// 1. coordination inbox for my team
const inbox = await sql`SELECT id,from_team,to_team,type,topic,stage,status,created_at FROM coordination WHERE status IN('open','in_progress') AND (to_team ILIKE '%정합성%' OR to_team ILIKE '%품질본부%') ORDER BY created_at DESC LIMIT 20`;
console.log('=== INBOX ===');
console.log(JSON.stringify(inbox, null, 1));

// 2. check if proposal E (인천 행정구역) already has a decision row
const dec = await sql`SELECT id, title, status, created_at FROM decisions WHERE title ILIKE '%서해구%' OR title ILIKE '%검단구%' OR title ILIKE '%영종구%' OR title ILIKE '%제물포구%' OR title ILIKE '%행정구역%' ORDER BY created_at DESC LIMIT 10`;
console.log('=== DECISION for proposal E ===');
console.log(JSON.stringify(dec, null, 1));
