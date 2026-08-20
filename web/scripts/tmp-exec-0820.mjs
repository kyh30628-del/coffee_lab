import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const l12 = await sql`select id,title,team,tier,severity,status,created_at from decisions where tier in ('L1','L2') and created_at > now() - interval '26 hours' order by created_at desc`;
console.log('=== L1/L2 decisions last 26h ===', l12.length);
console.table(l12.map(r=>({id:r.id,title:r.title.slice(0,40),team:r.team,tier:r.tier,status:r.status})));

const approved = await sql`select id,title,team,tier,status,created_at from decisions where status='approved' order by created_at`;
console.log('=== approved pending ===', approved.length);
console.table(approved.map(r=>({id:r.id,title:r.title.slice(0,50),team:r.team,tier:r.tier,age_days: null})));

const coord = await sql`select id,title,status,team,created_at from coordination where status not in ('resolved','closed') order by created_at`;
console.log('=== coordination open ===', coord.length);
console.table(coord.map(r=>({id:r.id,title:r.title.slice(0,50),status:r.status,team:r.team})));

const issues = await sql`select id,title,severity,status,team,created_at from issues where status='open' order by severity desc, created_at`;
console.log('=== issues open ===', issues.length);
console.table(issues.map(r=>({id:r.id,title:r.title.slice(0,50),severity:r.severity,team:r.team})));
