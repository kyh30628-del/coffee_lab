import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
delete process.env.ANTHROPIC_API_KEY;
const { coreTokens } = await import("../lib/reviewQuality.ts");
const { synthAndStore } = await import("../lib/synthStore.ts");
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, name, area, synth_count FROM cafes WHERE raw_reviews IS NOT NULL`;
// 매처 수정에 '실제로 영향받는' 카페 = 식별어가 없는(흔한 형용사/일반어뿐) 이름
const affected = rows.filter(c => coreTokens(c.name, c.area ? [c.area] : []).length === 0);
console.log(`전체 ${rows.length}곳 중 영향받는(흔한 이름) 카페: ${affected.length}곳`);
affected.slice(0,30).forEach(c=>console.log('  대상:', c.name, '('+c.area+')', c.synth_count+'건'));
let cleaned=0, removed=0; const drops=[];
for (const c of affected) {
  const before = c.synth_count ?? 0;
  try { await synthAndStore({id:c.id,name:c.name,area:c.area}, {refresh:false}); } catch(e){ console.log('  ✗',c.name,String(e).slice(0,40)); continue; }
  const after = (await sql`SELECT synth_count FROM cafes WHERE id=${c.id}`)[0]?.synth_count ?? 0;
  if (before !== after) { cleaned++; if(after<before) removed+=(before-after); if(before-after>=8) drops.push(`${c.name}(${c.area}): ${before}→${after}`); await sql`UPDATE cafes SET llm_judged_at=NULL WHERE id=${c.id}`; }
}
console.log(`\n=== 완료 ===\n영향받는 ${affected.length}곳 중 ${cleaned}곳 정리 · 오염 ${removed}건 제거 · 재판정 큐 등록`);
console.log(`큰 정리(8건↑):`); drops.slice(0,40).forEach(x=>console.log('  '+x));
