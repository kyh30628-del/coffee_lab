import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);
const recent = await sql`SELECT id, title, team, action_type, status, tier, severity FROM decisions ORDER BY id DESC LIMIT 8`;
console.log(JSON.stringify(recent, null, 1));
