import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='audit_flags'`;
console.log('audit_flags cols', cols.map(c=>c.column_name));
const cols2 = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='coordination'`;
console.log('coordination cols', cols2.map(c=>c.column_name));
