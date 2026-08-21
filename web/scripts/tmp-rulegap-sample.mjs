import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='cafes' AND column_name ILIKE '%offctx%'`;
console.log('offctx cols:', JSON.stringify(cols));
const cols2 = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='cafes' ORDER BY column_name`;
console.log('cafes cols:', cols2.map(c=>c.column_name).join(','));
