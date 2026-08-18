import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const tot = await sql`SELECT count(*) FROM cafes WHERE published AND synth_identity ILIKE '%루프탑%'`;
console.log('total published w/ 루프탑 identity:', tot[0].count);

const basement = await sql`SELECT count(*) FROM cafes WHERE published AND synth_identity ILIKE '%루프탑%' AND (address ILIKE '%지하%')`;
console.log('of those, basement address:', basement[0].count);

// sample non-basement ones to see if legit (has review evidence)
const nonBasement = await sql`SELECT id,name,address,synth_identity FROM cafes WHERE published AND synth_identity ILIKE '%루프탑%' AND address NOT ILIKE '%지하%' LIMIT 5`;
console.log(JSON.stringify(nonBasement,null,1));
