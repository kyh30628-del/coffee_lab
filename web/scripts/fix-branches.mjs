import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
delete process.env.ANTHROPIC_API_KEY;
const { synthAndStore } = await import("./lib/synthStore.ts");
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, name, area, synth_count FROM cafes WHERE raw_reviews IS NOT NULL AND name ~ '점\s*$' ORDER BY id`;
console.log(`지점 카페(이름 '○○점'): ${rows.length}곳 재합성`);
let chg=0, removed=0; const drops=[];
for (const c of rows) {
  const b=c.synth_count??0;
  try { await synthAndStore({id:c.id,name:c.name,area:c.area},{refresh:false}); } catch(e){ console.log('✗',c.name,String(e).slice(0,40)); continue; }
  const a=(await sql`SELECT synth_count FROM cafes WHERE id=${c.id}`)[0]?.synth_count??0;
  if(b!==a){ chg++; if(a<b)removed+=(b-a); if(b-a>=10)drops.push(`${c.name}(${c.area}): ${b}→${a}`); await sql`UPDATE cafes SET llm_judged_at=NULL WHERE id=${c.id}`; }
}
console.log(`\n변동 ${chg}곳 · 오염 ${removed}건 제거 · 재판정 큐 등록`);
drops.sort((x,y)=>parseInt(y.split('→')[1])-parseInt(x.split('→')[1])).slice(0,30).forEach(x=>console.log('  '+x));
