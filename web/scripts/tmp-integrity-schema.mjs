import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const m = env.match(/DATABASE_URL=(.+)/);
const sql = neon(m[1].trim());
const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='cafes' ORDER BY ordinal_position`;
console.log(cols.map(c=>c.column_name+':'+c.data_type).join('\n'));
