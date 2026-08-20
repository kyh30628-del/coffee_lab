import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const ids = [8194,8432,11014,15407,393,3537,5114];
const rows = await sql`SELECT id, name, area, grade, published, offctx_rate FROM cafes WHERE id = ANY(${ids})`;
console.table(rows);
