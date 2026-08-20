import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='coordination' ORDER BY ordinal_position`;
console.log(cols.map(c=>c.column_name).join(', '));
const rows = await sql`SELECT id, title, status, team, created_at FROM coordination WHERE title ILIKE '%판독%' OR title ILIKE '%heal%' OR id = 319 ORDER BY id DESC LIMIT 10`;
console.table(rows);
