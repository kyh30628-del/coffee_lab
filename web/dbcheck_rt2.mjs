import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

console.log('=== 3 cafes from coord#320 status ===');
const c = await sql`SELECT id,name,area,published,synth_grade,synth_count,offctx_rate FROM cafes WHERE id IN (7202,11117,18295)`;
c.forEach(r => console.log(JSON.stringify(r)));

console.log('=== decisions cols ===');
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='decisions' ORDER BY ordinal_position`;
console.log(cols.map(r=>r.column_name).join(','));

console.log('=== recent decisions re 아이엠케익/19936 ===');
const dec = await sql`SELECT id,title,status,created_at FROM decisions WHERE title ILIKE '%아이엠케익%' OR title ILIKE '%19936%' ORDER BY created_at DESC LIMIT 5`;
dec.forEach(r => console.log(JSON.stringify(r)));

console.log('=== recent decisions re noncafe-biz/7202/11117/18295 ===');
const dec2 = await sql`SELECT id,title,status,created_at FROM decisions WHERE title ILIKE '%7202%' OR title ILIKE '%11117%' OR title ILIKE '%18295%' OR title ILIKE '%noncafe%' OR title ILIKE '%채용공고%' ORDER BY created_at DESC LIMIT 5`;
dec2.forEach(r => console.log(JSON.stringify(r)));
