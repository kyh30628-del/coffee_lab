import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT id, name, offctx_rate, synth_count FROM cafes
  WHERE published = true AND (name ILIKE '%보호작업장%' OR name ILIKE '%위캔%' OR name ILIKE '%굿윌%' OR name ILIKE '%장애인%' OR name ILIKE '%복지관%' OR name ILIKE '%자립작업장%')
`;
console.log(JSON.stringify(rows, null, 1));
