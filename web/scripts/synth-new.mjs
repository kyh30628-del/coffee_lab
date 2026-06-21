import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const { synthAndStore } = await import("../lib/synthStore.ts");
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, name, area FROM cafes WHERE source='discover' AND synth_updated IS NULL ORDER BY id`;
console.log(`신규 합성 대상: ${rows.length}곳`);
let pub=0, done=0, errs=0;
for (const c of rows) {
  try { const r = await synthAndStore(c); done++; if(r.published) pub++; }
  catch(e){ errs++; if(errs<=3) console.log(`  ✗ ${c.name}: ${String(e).slice(0,40)}`); }
  if(done%100===0) console.log(`  ${done}/${rows.length} 처리 · 신규공개 ${pub}`);
  await new Promise(r=>setTimeout(r,200));
}
console.log(`\n=== 완료: ${done}곳 합성 · 신규 공개 ${pub}곳 · 오류 ${errs} ===`);
