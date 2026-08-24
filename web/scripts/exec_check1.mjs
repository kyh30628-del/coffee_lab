import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const approved = await sql`SELECT id, title, team, tier, status, created_at, action_type FROM decisions WHERE status='approved' ORDER BY id`;
console.log('--- approved ---');
for (const r of approved) console.log(r.id, r.tier, r.team, r.action_type, String(r.created_at).slice(0,10), '|', r.title.slice(0,70));

const recent = await sql`SELECT id, title, team, tier, status, created_at FROM decisions WHERE created_at > now() - interval '26 hours' AND tier IN ('L1','L2') ORDER BY id`;
console.log('--- L1/L2 recent 26h ---');
for (const r of recent) console.log(r.id, r.tier, r.team, r.status, String(r.created_at), '|', r.title.slice(0,70));

const coord = await sql`SELECT status, count(*) FROM coordination GROUP BY status`;
console.log('--- coordination status ---', JSON.stringify(coord));

const coordOpen = await sql`SELECT id, title, from_team, to_team, status, created_at FROM coordination WHERE status NOT IN ('resolved','closed','done') ORDER BY created_at ASC`;
console.log('--- coordination open ---');
for (const r of coordOpen) console.log(r.id, r.from_team, '->', r.to_team, r.status, String(r.created_at), '|', r.title?.slice(0,60));
