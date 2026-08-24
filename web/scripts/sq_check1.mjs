import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const coord = await sql`SELECT id, from_team, to_team, type, topic, stage, status FROM coordination WHERE status IN ('open','in_progress') AND (to_team ILIKE '%검색%' OR to_team ILIKE '%경험%' OR to_team ILIKE '%UX%' OR to_team ILIKE '%전체%' OR to_team ILIKE '%전사%') ORDER BY id DESC LIMIT 15`;
console.log("COORD_INBOX", JSON.stringify(coord));

const decs = await sql`SELECT id, action_type, status, title, team, created_at FROM decisions WHERE title ILIKE '%검색%' OR title ILIKE '%추천%' OR title ILIKE '%franchise%' OR title ILIKE '%랭킹%' ORDER BY id DESC LIMIT 10`;
console.log("DECISIONS", JSON.stringify(decs));

const prevProposal = await sql`SELECT id, status, title, created_at FROM decisions WHERE id=452 OR id=727`;
console.log("PREV", JSON.stringify(prevProposal));
