import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

// find published cafes with quality flag data - check schema first
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='cafes' ORDER BY ordinal_position`;
console.log('cafes cols:', cols.map(c=>c.column_name).join(','));
