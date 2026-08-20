import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const recent = await sql`SELECT id, status, stage, type, from_team, to_team, topic FROM coordination ORDER BY id DESC LIMIT 5`;
console.log(JSON.stringify(recent, null, 1));
