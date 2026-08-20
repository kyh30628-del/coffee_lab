import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const pending = await sql`SELECT id, region, area_label, keywords, priority, status, created_at FROM discovery_targets WHERE status='pending' ORDER BY priority DESC`;
console.log('PENDING:', JSON.stringify(pending));

const recent = await sql`SELECT id, region, area_label, keywords, status, priority, created_at FROM discovery_targets WHERE created_at > now() - interval '10 days' ORDER BY created_at DESC LIMIT 20`;
console.log('RECENT:', JSON.stringify(recent));

const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='discovery_targets'`;
console.log('COLS:', cols.map(r=>r.column_name).join(', '));

// coordination inbox for growth team
const coord = await sql`SELECT id, from_team, to_team, type, topic, detail, stage, status, created_at FROM coordination WHERE status IN ('open','in_progress') AND (to_team ILIKE '%성장%' OR to_team ILIKE '%발굴%' OR to_team ILIKE '%그로스%' OR to_team ILIKE '%demand%')`;
console.log('COORD_INBOX:', JSON.stringify(coord));

// demand_gaps
const gaps = await sql`SELECT region, kind, term, searches, avg_results FROM demand_gaps ORDER BY searches DESC LIMIT 15`;
console.log('DEMAND_GAPS:', JSON.stringify(gaps));

// search_log low results recent 14d
const sl = await sql`SELECT q, region, results, mode, count(*) c FROM search_log WHERE ts > now() - interval '14 days' AND results < 3 GROUP BY q, region, results, mode ORDER BY c DESC LIMIT 20`;
console.log('SEARCHLOG_LOW:', JSON.stringify(sl));
