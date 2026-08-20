import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const ids = [9634, 10125, 18293, 19003, 1380, 6478, 18724];
for (const id of ids) {
  const rows = await sql`SELECT id, name, synth_reviews FROM cafes WHERE id = ${id}`;
  const r = rows[0];
  if (!r) continue;
  console.log(`\n=== ${r.id} ${r.name} ===`);
  const reviews = r.synth_reviews;
  let arr = [];
  try { arr = typeof reviews === 'string' ? JSON.parse(reviews) : reviews; } catch(e) { console.log('parse fail', e.message); continue; }
  if (!Array.isArray(arr)) { console.log('not array', typeof arr); continue; }
  for (const rv of arr.slice(0, 8)) {
    const text = (rv.text || rv.body || rv.content || '').slice(0, 150).replace(/\n/g, ' ');
    console.log(`- [${rv.offctx ?? rv.off_ctx ?? '?'}] ${text}`);
  }
}
