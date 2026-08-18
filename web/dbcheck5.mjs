import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

const d = await sql`SELECT id,title,detail,status,action_type,created_at FROM decisions WHERE id=742`;
console.log(JSON.stringify(d,null,1));
