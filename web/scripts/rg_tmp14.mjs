import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

for (const id of ["1198","11232"]) {
  const rows = await sql`SELECT id, name, synth_reviews FROM cafes WHERE id = ${id}`;
  const r = rows[0];
  const rv = r.synth_reviews.find(x => /일시|모임/.test(x.quote||''));
  console.log(`\n=== id${r.id} ${r.name} ===`);
  console.log(JSON.stringify(rv, null, 1));
}
