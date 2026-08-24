import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id,title,status,tier,action_type,decided_at FROM decisions WHERE id IN (804,806,807,808,809,742) ORDER BY id`;
console.log(JSON.stringify(rows,null,1));
