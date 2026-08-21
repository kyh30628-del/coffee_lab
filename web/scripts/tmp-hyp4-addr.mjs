import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);
const ids = ['4064','18091','7784','7785','7835','13854'];
const rows = await sql`SELECT id,name,address,lat,lng,synth_grade,synth_count FROM cafes WHERE id = ANY(${ids}) ORDER BY id`;
console.log(JSON.stringify(rows, null, 1));
