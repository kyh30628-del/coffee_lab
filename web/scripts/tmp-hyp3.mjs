import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const s = await sql`SELECT id, synth_reviews FROM cafes WHERE published=true AND synth_reviews IS NOT NULL LIMIT 1`;
console.log(JSON.stringify(s, null, 1));
