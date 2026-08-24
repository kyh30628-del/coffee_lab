import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`SELECT id, action_type, status, title, team, severity, tier, action_params FROM decisions WHERE id IN (810,812) ORDER BY id`;
console.log(JSON.stringify(rows, null, 1));
