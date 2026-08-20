import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

const d704 = await sql`SELECT id,title,detail,action_params,result,decided_at FROM decisions WHERE id=704`;
console.log('=== decision #704 detail ===');
console.log(JSON.stringify(d704, null, 1));

const cafe = await sql`SELECT id,name,synth_grade,synth_count,synth_updated,offctx_rate,published FROM cafes WHERE id=13050`;
console.log('=== id13050 current state ===');
console.log(JSON.stringify(cafe, null, 1));

const reviews = await sql`SELECT synth_reviews FROM cafes WHERE id=13050`;
console.log('=== id13050 current synth_reviews (first 2) ===');
const r = reviews[0]?.synth_reviews;
console.log(typeof r, Array.isArray(r) ? r.length : 'n/a');
console.log(JSON.stringify(r).slice(0,1500));
