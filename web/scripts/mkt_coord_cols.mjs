import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='coordination' ORDER BY ordinal_position`;
console.log(JSON.stringify(cols.map(c=>c.column_name)));
