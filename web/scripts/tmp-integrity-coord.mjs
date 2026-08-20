import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const m = env.match(/DATABASE_URL=(.+)/);
const sql = neon(m[1].trim());
const rows = await sql`SELECT id, from_team, to_team, type, topic, stage, status, created_at FROM coordination WHERE status IN ('open','in_progress') AND (to_team ILIKE '%정합성%' OR to_team ILIKE '%품질본부%') ORDER BY created_at DESC LIMIT 20`;
console.log(JSON.stringify(rows, null, 2));
