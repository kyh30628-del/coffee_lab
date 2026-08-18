import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const cols = await sql`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='decisions' ORDER BY ordinal_position`;
console.log(JSON.stringify(cols, null, 1));
const recent = await sql`SELECT id, title, action_type, status, requested_by, created_at FROM decisions ORDER BY id DESC LIMIT 5`;
console.log(JSON.stringify(recent, null, 1));
