import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const ids = [1316, 18293, 1780, 10537, 8558, 6659, 247, 2729];
const rows = await sql`SELECT id,name,naver_category,address,synth_identity FROM cafes WHERE id = ANY(${ids})`;
console.log(JSON.stringify(rows, null, 1));
