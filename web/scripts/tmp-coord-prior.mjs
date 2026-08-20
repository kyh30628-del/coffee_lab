import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const rows = await sql`SELECT id, type, from_team, to_team, stage, due_at FROM coordination WHERE from_team ILIKE '%전사%' OR from_team ILIKE '%자율진단%' ORDER BY id DESC LIMIT 5`;
console.table(rows);
