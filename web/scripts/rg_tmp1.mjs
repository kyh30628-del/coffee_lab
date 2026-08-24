import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const coord = await sql`SELECT id,from_team,to_team,type,topic,detail,stage,status,created_at FROM coordination WHERE (to_team ILIKE '%룰갭%' OR to_team ILIKE '%품질본부%') AND status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 20`;
console.log('=== coordination inbox for me ===');
console.log(JSON.stringify(coord, null, 1));
