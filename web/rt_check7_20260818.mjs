import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const r = await sql`SELECT id,name,address,synth_identity,synth_reviews FROM cafes WHERE id=10537`;
const c = r[0];
console.log(c.address, '|', c.synth_identity);
const revs = typeof c.synth_reviews === 'string' ? JSON.parse(c.synth_reviews) : c.synth_reviews;
revs.forEach((rv,i)=>console.log(i, rv.quote));

// check systemic: other verified cafes with 지하 in address but 루프탑 in identity
const sys = await sql`SELECT id,name,address,synth_identity FROM cafes WHERE published AND synth_grade='검증' AND address ILIKE '%지하%' AND synth_identity ILIKE '%루프탑%'`;
console.log('\n=== systemic check (지하 address + 루프탑 identity) ===', JSON.stringify(sys, null, 1));
