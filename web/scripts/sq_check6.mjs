import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`SELECT id, name, area, published, synth_grade, char_scores->>'work' as work, char_scores->>'dessert' as dessert, char_scores->>'roast' as roast FROM cafes WHERE area ILIKE '%강남구%' AND synth_grade='검증' AND published = true ORDER BY (char_scores->>'work')::numeric DESC NULLS LAST LIMIT 15`;
for (const r of rows) console.log(r.id, r.name, '|area=',r.area, 'work=',r.work, 'dessert=',r.dessert, 'roast=',r.roast);

console.log('---target cafes area check---');
const rows2 = await sql`SELECT id, name, area, published FROM cafes WHERE id IN (15158, 16892)`;
for (const r of rows2) console.log(JSON.stringify(r));
