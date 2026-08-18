import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const d = await sql`SELECT id,title,detail,team,severity,action_type,action_params,status,tier,recommendation FROM decisions WHERE id=756`;
console.log(JSON.stringify(d,null,1));
