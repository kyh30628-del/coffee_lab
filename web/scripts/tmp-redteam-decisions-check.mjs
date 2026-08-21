import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const rows = await sql`SELECT DISTINCT action_type FROM decisions WHERE action_type IS NOT NULL ORDER BY 1`;
console.log(JSON.stringify(rows.map(r=>r.action_type)));
