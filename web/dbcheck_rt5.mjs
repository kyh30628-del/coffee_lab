import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='coordination' ORDER BY ordinal_position`;
console.log(cols.map(r=>r.column_name).join(','));
