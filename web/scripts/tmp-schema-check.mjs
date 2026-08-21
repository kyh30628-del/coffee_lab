import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);
const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='cafes' ORDER BY ordinal_position`;
console.log(cols.map(c=>c.column_name).join(', '));
