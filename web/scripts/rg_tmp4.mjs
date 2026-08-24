import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const ids = ["6478","1780","19707","1380","6659"];
for (const id of ids) {
  const rows = await sql`SELECT id, name, area, naver_category, synth_reviews FROM cafes WHERE id = ${id}`;
  const r = rows[0];
  if (!r) continue;
  let reviews = [];
  try { reviews = JSON.parse(r.synth_reviews || "[]"); } catch(e) { reviews = []; }
  console.log(`\n=== id${r.id} ${r.name} (${r.area}, ${r.naver_category}) — 표시 ${reviews.length}건 ===`);
  for (const rv of reviews.slice(0, 8)) {
    const txt = (rv.text || rv.review || JSON.stringify(rv)).slice(0, 140);
    console.log(`- [${rv.source||''}] ${txt}`);
  }
}
