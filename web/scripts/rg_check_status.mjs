import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT DISTINCT status FROM decisions`;
console.log(rows.map(r=>r.status));
const maxid = await sql`SELECT MAX(id) as m FROM decisions`;
console.log('max id', maxid[0].m);
