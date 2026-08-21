import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const s = await sql`SELECT DISTINCT status FROM decisions`;
console.log('statuses:', s.map(r=>r.status));
const t = await sql`SELECT DISTINCT tier FROM decisions`;
console.log('tiers:', t.map(r=>r.tier));
const sample = await sql`SELECT id,title,detail,team,severity,action_type,action_params,status,tier,recommendation FROM decisions WHERE id=790`;
console.log(JSON.stringify(sample,null,1));
