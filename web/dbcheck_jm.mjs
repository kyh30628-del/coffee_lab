import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const [row] = await sql`SELECT id, name, area, synth_reviews FROM cafes WHERE id = '19681'`;
console.log(row.name, row.area);
const revs = row.synth_reviews || [];
revs.forEach((r, i) => console.log(`\n[${i}] trust=${r.trust} score=${r.score}\nFULL: ${r.quote}`));
