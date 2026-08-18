import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const [row] = await sql`SELECT id, name, raw_reviews FROM cafes WHERE id = '9294'`;
const raws = row.raw_reviews || [];
console.log('total raw:', raws.length);
const hit = raws.filter(r => (r.quote||r.body||'').includes('실거래가') || (r.title||'').includes('실거래가'));
hit.forEach(r => console.log(JSON.stringify(r).slice(0,500)));
