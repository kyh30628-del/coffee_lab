import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const terms = process.argv.slice(2);
for (const t of terms) {
  const rows = await sql`
    SELECT count(*) as c FROM cafes
    WHERE published = true AND raw_reviews::text ILIKE ${'%' + t + '%'}
  `;
  console.log(t, '-> count=', rows[0].c);
}
