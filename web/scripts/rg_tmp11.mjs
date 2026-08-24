import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`SELECT synth_reviews FROM cafes WHERE id = '17498'`;
const r = rows[0].synth_reviews.find(x => (x.quote||'').includes('정기모임'));
console.log(JSON.stringify(r, null, 1));

const rows2 = await sql`SELECT synth_reviews FROM cafes WHERE id = '6844'`;
const r2 = rows2[0].synth_reviews.filter(x => (x.quote||'').includes('정모') || (x.source||'').includes('네이버 카페'));
console.log(JSON.stringify(r2, null, 1));
