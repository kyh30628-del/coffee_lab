import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='agent_runs' ORDER BY column_name`;
console.log('cols:', cols.map(c=>c.column_name).join(','));
const runs = await sql`SELECT * FROM agent_runs WHERE job='cron-sentinel' ORDER BY ran_at DESC LIMIT 3`;
console.log(JSON.stringify(runs,null,1));
