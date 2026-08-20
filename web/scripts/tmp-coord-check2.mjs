import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const rows = await sql`SELECT id, topic, status, to_team, created_at, resolved_at FROM coordination WHERE topic ILIKE '%판독%' OR topic ILIKE '%heal%' OR id = 319 ORDER BY id DESC LIMIT 10`;
console.table(rows);
