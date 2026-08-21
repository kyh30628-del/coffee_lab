import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const row = await sql`SELECT id, name, area, synth_identity, char_scores, synth_reviews FROM cafes WHERE id=6659`;
const c = row[0];
console.log('name:', c.name, 'area:', c.area);
console.log('identity:', c.synth_identity);
console.log('char_scores:', JSON.stringify(c.char_scores));
const reviews = typeof c.synth_reviews === 'string' ? JSON.parse(c.synth_reviews) : c.synth_reviews;
console.log('review count:', Array.isArray(reviews) ? reviews.length : 'n/a');
if (Array.isArray(reviews)) {
  reviews.slice(0, 8).forEach((r, i) => console.log(`[${i}]`, typeof r === 'string' ? r.slice(0,150) : JSON.stringify(r).slice(0,200)));
}
