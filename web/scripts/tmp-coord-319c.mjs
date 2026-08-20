import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const c = await sql`SELECT id, status, topic, detail, to_team, created_at, resolved_at FROM coordination WHERE id=319 OR detail ILIKE '%사람판독%' OR detail ILIKE '%heal_no_effect%' ORDER BY id DESC LIMIT 10`;
console.log(JSON.stringify(c, null, 1));
