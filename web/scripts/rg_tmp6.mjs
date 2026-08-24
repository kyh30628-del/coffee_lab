import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const ids = ["1780","19707","1380","6659","247","6844","2729","6528"];
for (const id of ids) {
  const rows = await sql`SELECT id, name, area, naver_category, offctx_rate, synth_reviews FROM cafes WHERE id = ${id}`;
  const r = rows[0];
  if (!r) continue;
  const reviews = r.synth_reviews || [];
  console.log(`\n=== id${r.id} ${r.name} (${r.area}, ${r.naver_category}, offctx=${r.offctx_rate}) — 표시 ${reviews.length}건 ===`);
  for (const rv of reviews) {
    console.log(`- [${rv.source||''}] ${(rv.quote||'').slice(0,120)}`);
  }
}
