import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const m = env.match(/DATABASE_URL=(.*)/);
const sql = neon(m[1].trim());
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='cafes' AND column_name ILIKE '%pub%'`;
console.log(JSON.stringify(cols));
