import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const c = await sql`SELECT id, status, title, to_team, created_at, resolved_at FROM coordination WHERE id=319 OR title ILIKE '%사람판독%' ORDER BY id DESC LIMIT 10`;
console.table(c);
const note = await sql`SELECT note FROM heal_attempts WHERE target_id=393 AND job='sentinel.attraction'`;
console.log(JSON.stringify(note));
