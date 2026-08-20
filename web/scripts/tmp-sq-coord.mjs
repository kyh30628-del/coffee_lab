import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const coord = await sql`SELECT id,from_team,to_team,type,topic,stage,status FROM coordination WHERE (to_team ILIKE '%검색%' OR to_team ILIKE '%경험%' OR to_team ILIKE '%UX%') AND status IN ('open','in_progress') ORDER BY id DESC LIMIT 15`;
console.log('COORD to me:', JSON.stringify(coord, null, 1));
