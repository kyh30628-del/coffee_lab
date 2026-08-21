import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const ids = [20137,17455,16953,13838,10534,16536,13239];
for (const id of ids) {
  const rows = await sql`SELECT id, name, synth_reviews FROM cafes WHERE id=${id}`;
  const c = rows[0];
  let quotes = [];
  try {
    const sr = typeof c.synth_reviews === 'string' ? JSON.parse(c.synth_reviews) : c.synth_reviews;
    quotes = (sr || []).slice(0,3).map(r => (r.text||r.quote||r.review||JSON.stringify(r)).slice(0,120));
  } catch(e) { quotes = ['parse_err']; }
  console.log(`--- ${id} ${c.name} ---`);
  quotes.forEach(q => console.log('  ' + q));
}
