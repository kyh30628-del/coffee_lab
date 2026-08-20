import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const coord = await sql`select id,topic,status,from_team,to_team,created_at,stage from coordination where status not in ('resolved','closed') order by created_at`;
console.log('=== coordination open ===', coord.length);
console.table(coord.map(r=>({id:r.id,topic:(r.topic||'').slice(0,45),status:r.status,from:r.from_team,to:r.to_team,age_h: null})));

const issues = await sql`select id,ikey,title,severity,status,team,first_seen from issues where status='open' order by severity desc, first_seen`;
console.log('=== issues open ===', issues.length);
console.table(issues.map(r=>({id:r.id,ikey:r.ikey,title:(r.title||'').slice(0,45),severity:r.severity,team:r.team})));

const l2pending = await sql`select id,title,team,tier,severity,status,detail,created_at from decisions where tier='L2' and status='pending' order by created_at`;
console.log('=== L2 pending FULL detail ===');
for (const r of l2pending) {
  console.log(`--- #${r.id} [${r.team}] ${r.title}`);
  console.log((r.detail||'').slice(0,500));
}
