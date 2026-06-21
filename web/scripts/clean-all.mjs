import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
delete process.env.ANTHROPIC_API_KEY;
const { synthAndStore } = await import("../lib/synthStore.ts");
const sql = neon(process.env.DATABASE_URL);
// 후기 많은(=오염·노출 심한) 순으로 먼저 정리
const rows = await sql`SELECT id, name, area, synth_count FROM cafes WHERE raw_reviews IS NOT NULL ORDER BY synth_count DESC NULLS LAST`;
console.log(`전 카페 재합성(개선매처, 병렬): ${rows.length}곳`);
let chg=0, removed=0, done=0; const bigDrops=[];
const CONC = 6;
async function one(c){
  const before = c.synth_count ?? 0;
  try { await synthAndStore({id:c.id,name:c.name,area:c.area}, {refresh:false}); } catch(e){ return; }
  const a = (await sql`SELECT synth_count FROM cafes WHERE id=${c.id}`)[0];
  const after = a?.synth_count ?? 0;
  if (before !== after) { chg++; if(after<before) removed+=(before-after); if(before-after>=30) bigDrops.push(`${c.name}(${c.area}): ${before}→${after}`); await sql`UPDATE cafes SET llm_judged_at=NULL WHERE id=${c.id}`; }
  done++;
  if (done % 500 === 0) console.log(`  …${done}/${rows.length} · 변동 ${chg} · 오염제거 ${removed}`);
}
for (let i=0;i<rows.length;i+=CONC){ await Promise.all(rows.slice(i,i+CONC).map(one)); }
console.log(`\n=== 완료: 변동 ${chg}곳 · 오염 ${removed}건 제거 ===`);
bigDrops.slice(0,50).forEach(x=>console.log('  '+x));
