import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT id, name, area, dong, offctx_rate, synth_count, synth_grade, published
  FROM cafes
  WHERE published = true AND offctx_rate IS NOT NULL AND offctx_rate > 0.15
  ORDER BY offctx_rate DESC LIMIT 25
`;
console.log(JSON.stringify(rows, null, 1));
