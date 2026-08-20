import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const r = await sql`SELECT id, from_team, to_team, topic, status, created_at FROM coordination WHERE topic ILIKE '%북마크%' OR topic ILIKE '%bookmark%' OR topic ILIKE '%취향%' ORDER BY id DESC LIMIT 5`;
console.log(JSON.stringify(r));
