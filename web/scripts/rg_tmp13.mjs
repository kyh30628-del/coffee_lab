import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const ids = ["8972","8040","1198","11232"];
for (const id of ids) {
  const rows = await sql`SELECT id, name, area, synth_reviews FROM cafes WHERE id = ${id}`;
  const r = rows[0];
  console.log(`\n=== id${r.id} ${r.name} (${r.area}) ===`);
  for (const rv of r.synth_reviews) {
    if (/일시\s*:|장소\s*:/.test(rv.quote||'')) {
      console.log(`- [${rv.source||''}] ${(rv.quote||'').slice(0,220)}`);
    }
  }
}
