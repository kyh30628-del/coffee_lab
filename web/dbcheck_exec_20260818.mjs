import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const approved = await sql`SELECT id,title,team,tier,action_type,created_at FROM decisions WHERE status='approved' ORDER BY created_at ASC`;
console.log('=== APPROVED (미집행) ===');
approved.forEach(r=>console.log(r.id, r.tier, r.action_type, r.team, String(r.title).slice(0,60), r.created_at));

const l3pending = await sql`SELECT id,title,team,created_at FROM decisions WHERE status='pending' AND tier='L3' ORDER BY created_at ASC`;
console.log('=== L3 PENDING ===');
l3pending.forEach(r=>console.log(r.id, r.team, String(r.title).slice(0,70), r.created_at));

const recent = await sql`SELECT id,title,team,tier,status,created_at FROM decisions WHERE tier IN ('L1','L2') AND created_at > now() - interval '26 hours' ORDER BY created_at DESC`;
console.log('=== L1/L2 최근26h ===');
recent.forEach(r=>console.log(r.id, r.tier, r.status, r.team, String(r.title).slice(0,60), r.created_at));

let coord;
try {
  coord = await sql`SELECT id,title,from_team,to_team,status,created_at FROM coordination WHERE status != 'resolved' ORDER BY created_at ASC`;
} catch(e) { coord = 'ERR:'+e.message; }
console.log('=== COORD open ===');
if (Array.isArray(coord)) coord.forEach(r=>console.log(r.id, r.status, r.from_team,'->',r.to_team, String(r.title).slice(0,60), r.created_at));
else console.log(coord);

const issues = await sql`SELECT id,title,team,severity,status,created_at FROM issues WHERE status='open' ORDER BY severity DESC, created_at ASC`;
console.log('=== ISSUES open ===');
issues.forEach(r=>console.log(r.id, r.severity, r.team, String(r.title).slice(0,60), r.created_at));
