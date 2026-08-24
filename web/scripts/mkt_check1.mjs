import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

// 1. coordination inbox for marketing
const coord = await sql`SELECT id, from_team, to_team, type, topic, detail, stage, status, created_at FROM coordination WHERE status IN ('open','in_progress') AND (to_team ILIKE '%마케팅%' OR to_team ILIKE '%영업%' OR to_team ILIKE '%전체%' OR to_team ILIKE '%전사%') ORDER BY id DESC LIMIT 20`;
console.log("COORD_INBOX", JSON.stringify(coord));

// 2. schema check for user_consents & traffic_events (columns)
const cols1 = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='user_consents' ORDER BY ordinal_position`;
console.log("UC_COLS", JSON.stringify(cols1.map(c=>c.column_name)));
const cols2 = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='traffic_events' ORDER BY ordinal_position`;
console.log("TE_COLS", JSON.stringify(cols2.map(c=>c.column_name)));

// 3. sample rows to sanity check
const sampleUC = await sql`SELECT anon_id, visit_count, src, referrer, utm_source, last_seen, created_at, region, internal, user_agent FROM user_consents ORDER BY created_at DESC LIMIT 5`;
console.log("UC_SAMPLE", JSON.stringify(sampleUC));
