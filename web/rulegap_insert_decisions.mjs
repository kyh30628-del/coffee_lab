import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

// check decisions table columns first
const cols = await sql`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name='decisions' ORDER BY ordinal_position`;
console.log(cols.map(c => c.column_name).join(', '));
