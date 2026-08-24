import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`SELECT id, name, synth_reviews, pg_typeof(synth_reviews) as t FROM cafes WHERE id = '6478'`;
console.log(JSON.stringify(rows[0]).slice(0, 2000));
