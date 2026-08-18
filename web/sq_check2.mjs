import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const sql = neon(m[1].replace(/^['"]|['"]$/g, ''));
const rows = await sql`SELECT DISTINCT from_team FROM coordination WHERE from_team ILIKE '%검색%' OR from_team ILIKE '%search%' ORDER BY 1`;
console.log(rows);
const inbox2 = await sql`SELECT id,from_team,to_team,type,topic,stage,status,created_at FROM coordination WHERE to_team ILIKE '%검색%' OR to_team ILIKE '%UX%' OR to_team ILIKE '%경험%' ORDER BY created_at DESC LIMIT 10`;
console.log(inbox2);
