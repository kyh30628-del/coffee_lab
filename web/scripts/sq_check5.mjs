import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`SELECT id, name, published, synth_grade, char_scores->>'work' as work, char_scores->>'dessert' as dessert, char_scores->>'roast' as roast FROM cafes WHERE area = '강남구' AND synth_grade='검증' AND published = true ORDER BY (char_scores->>'work')::numeric DESC NULLS LAST LIMIT 12`;
for (const r of rows) console.log(r.id, r.name, 'work=',r.work, 'dessert=',r.dessert, 'roast=',r.roast);
