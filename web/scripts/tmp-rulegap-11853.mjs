import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, name, published, synth_updated, offctx_ok, offctx_rate, synth_reviews FROM cafes WHERE id='11853'`;
const r = rows[0];
console.log('id11853', r.name, 'published=', r.published, 'synth_updated=', r.synth_updated, 'offctx_ok=', r.offctx_ok, 'offctx_rate=', r.offctx_rate);
let sr = r.synth_reviews;
if (typeof sr === 'string') { try { sr = JSON.parse(sr); } catch {} }
console.log('synth_reviews count=', Array.isArray(sr)?sr.length:'n/a');
(sr||[]).forEach((rv,i)=>console.log(i, (rv.quote||'').slice(0,60)));
