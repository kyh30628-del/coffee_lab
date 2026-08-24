import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`SELECT id, name, area, offctx_rate, offctx_ok, synth_grade, synth_reviews FROM cafes WHERE id = '17498'`;
const r = rows[0];
console.log(`id${r.id} ${r.name} (${r.area}) offctx_rate=${r.offctx_rate} offctx_ok=${r.offctx_ok} grade=${r.synth_grade}`);
for (const rv of r.synth_reviews) {
  console.log(`- [${rv.source||''}] ${(rv.quote||'').slice(0,160)}`);
}
