import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`SELECT id, name, synth_grade, synth_count, char_scores->>'work' as work FROM cafes WHERE area = '강남구' AND synth_grade='검증' ORDER BY (char_scores->>'work')::numeric DESC NULLS LAST LIMIT 15`;
for (const r of rows) console.log(r.name, r.work, r.synth_count);
