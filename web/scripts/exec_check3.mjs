import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='agent_runs' ORDER BY ordinal_position`;
console.log(cols.map(c=>c.column_name).join(','));
const rows = await sql`SELECT * FROM agent_runs WHERE job ILIKE '%chief-secretary%' AND ran_at > now() - interval '36 hours' ORDER BY ran_at DESC LIMIT 10`;
console.log(JSON.stringify(rows,null,1));
