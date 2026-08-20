import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

const ex = await sql`SELECT id,title,team,severity,action_type,action_params,status,tier,decided_by,recommendation FROM decisions WHERE id IN (751,752,753,704) ORDER BY id`;
console.log(JSON.stringify(ex,null,1));
