import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const ids = process.argv.slice(2);
for (const id of ids) {
  const rows = await sql`SELECT id, name, synth_reviews FROM cafes WHERE id = ${id}`;
  const r = rows[0];
  if (!r) continue;
  console.log('=====', r.id, r.name);
  let sr = r.synth_reviews;
  if (typeof sr === 'string') { try { sr = JSON.parse(sr); } catch {} }
  console.log(JSON.stringify(sr, null, 1).slice(0, 3000));
}
