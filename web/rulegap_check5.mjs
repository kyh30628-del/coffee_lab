import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const r1 = await sql`SELECT id, name, area, offctx_rate FROM cafes WHERE published=true AND (name LIKE '%작업실%' OR name LIKE '%스튜디오%') AND id != 9683 AND id != 8784 ORDER BY offctx_rate DESC NULLS LAST LIMIT 10`;
console.log('=== 작업실/스튜디오 이름 카페 ===');
r1.forEach(r => console.log(r.id, r.name, r.area, r.offctx_rate));

const r2 = await sql`SELECT id, name, area, offctx_rate FROM cafes WHERE published=true AND (name LIKE '%숲%' OR name LIKE '%정원%' OR name LIKE '%마당%') AND id != 16913 ORDER BY offctx_rate DESC NULLS LAST LIMIT 15`;
console.log('=== 숲/정원/마당 이름 카페 ===');
r2.forEach(r => console.log(r.id, r.name, r.area, r.offctx_rate));
