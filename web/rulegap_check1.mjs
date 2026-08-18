import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const inbox = await sql`SELECT id,from_team,type,topic,stage,status,created_at FROM coordination WHERE (to_team ILIKE '%룰갭%' OR to_team ILIKE '%품질본부%') AND status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 15`;
console.log('=== INBOX (to us, open) ===');
inbox.forEach(r => console.log(r.id, r.from_team, '|', r.topic, '|', r.stage, r.status));

const mine = await sql`SELECT id, topic, status, stage, to_team, resolved_at FROM coordination WHERE from_team ILIKE '%룰갭%' ORDER BY created_at DESC LIMIT 8`;
console.log('=== SENT BY US ===');
mine.forEach(r => console.log(r.id, r.to_team, '|', r.topic, '|', r.stage, r.status, r.resolved_at));

const dec = await sql`SELECT id, title, status, action_type, created_at FROM decisions WHERE id IN (760,761) ORDER BY id`;
console.log('=== DECISIONS 760/761 ===');
dec.forEach(r => console.log(r.id, r.status, r.action_type, '|', r.title));
