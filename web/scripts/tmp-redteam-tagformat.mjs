import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const rows = await sql`SELECT target_id, job, note, last_at FROM heal_attempts WHERE note LIKE '[사람판독%' ORDER BY last_at DESC LIMIT 10`;
console.log(JSON.stringify(rows, null, 1));
