import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const { isNonCafe } = await import("../lib/discover.ts");
const sql = neon(process.env.DATABASE_URL);
const ID=process.env.NAVER_CLIENT_ID, SEC=process.env.NAVER_CLIENT_SECRET;
const strip=(s)=>(s||"").replace(/<[^>]+>/g,"").replace(/&[a-z]+;/g,"").trim();
const nrm=(s)=>(s||"").replace(/\s/g,"");
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function catOf(name){
  const r=await fetch('https://openapi.naver.com/v1/search/local.json?query='+encodeURIComponent(name)+'&display=5',{headers:{'X-Naver-Client-Id':ID,'X-Naver-Client-Secret':SEC}});
  if(!r.ok) throw new Error('naver '+r.status);
  const d=await r.json(); const items=(d.items||[]).map(it=>({t:strip(it.title),c:it.category}));
  const nn=nrm(name);
  const m=items.find(it=>nrm(it.t)===nn)||items.find(it=>nrm(it.t).includes(nn)&&Math.abs(nrm(it.t).length-nn.length)<=2);
  return m?{cat:m.c,matched:true}:{cat:items[0]?.c||null,matched:false};
}
const rows=await sql`SELECT id,name,area,synth_count FROM cafes WHERE published ORDER BY synth_count DESC NULLS LAST`;
console.log(`전수 비카페 감사: ${rows.length}곳`);
let checked=0,unpub=0,errs=0; const removed=[];
for(const c of rows){
  try{
    const {cat,matched}=await catOf(c.name);
    if(cat) await sql`UPDATE cafes SET naver_category=${cat} WHERE id=${c.id}`;
    if(matched && cat && isNonCafe(c.name,cat)){ await sql`UPDATE cafes SET published=false WHERE id=${c.id}`; unpub++; removed.push(`${c.name}(${c.area}): ${cat}`); }
    checked++; errs=0;
    if(checked%200===0) console.log(`  …${checked}/${rows.length} · 비카페제거 ${unpub}`);
  }catch(e){ errs++; if(errs>=25){console.log('연속오류 중단(쿼터?) — '+checked+'까지'); break;} }
  await sleep(110);
}
console.log(`\n=== 완료: 검사 ${checked} · 비카페 제거 ${unpub} ===`);
removed.slice(0,100).forEach(x=>console.log('  🗑 '+x));
