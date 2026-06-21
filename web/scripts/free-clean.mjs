// 무료 결정적 정리 — LLM 없이. 위치/팝업/타지점 충돌 리뷰 drop → 재합성. 근거부족=보류. 의심 플래그 해소.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { collectAndSynthesize } = await import("../lib/collectOrchestrator.ts");
const { applyDecisions } = await import("../lib/synthStore.ts");
const { sql } = await import("../lib/db.ts");

const SEOUL_GU=["강남","강동","강북","강서","관악","광진","구로","금천","노원","도봉","동대문","동작","마포","서대문","서초","성동","성북","송파","양천","영등포","용산","은평","종로","중랑"];
const CITIES=["남양주","의정부","동두천","수원","성남","고양","용인","부천","안양","안산","화성","평택","시흥","파주","김포","광명","군포","오산","이천","양주","구리","안성","포천","의왕","하남","여주","과천","인천"];
const POP=/팝업|임시본점|임시매장/;
const VENUE=/롯데월드몰|롯데백화점|신세계백화점|현대백화점|스타필드|롯데타워|아브뉴프랑/;
const placeOf=(area)=>{ if(!area) return null; const s=String(area); const g=s.match(/([가-힣]{1,3})구/); if(g&&SEOUL_GU.includes(g[1])) return "gu:"+g[1]; for(const c of CITIES){ if(s.includes(c)) return "city:"+c; } return null; };
const placesIn=(q)=>{ const out=new Set(); if(!q) return out; for(const m of q.matchAll(/([가-힣]{1,3})구(?![가-힣])/g)){ if(SEOUL_GU.includes(m[1])) out.add("gu:"+m[1]); } for(const c of CITIES){ const re=new RegExp("(?<![가-힣])"+c+"시?(?![가-힣])"); if(re.test(q)) out.add("city:"+c); } return out; };
const norm=(s)=>String(s||"").replace(/\s/g,"");

// 대상: 그라운딩 의심 + 스캔≥2 (하츠 6542 제외 — 이미 처리)
const sus=await sql`SELECT DISTINCT c.id FROM grounding_checks g JOIN cafes c ON c.id=g.cafe_id WHERE NOT g.grounded AND c.published AND g.checked_at>=c.synth_updated AND c.llm_judged_at IS NOT NULL AND c.llm_judged_at>=c.raw_collected_at`;
let scan=[]; try{ scan=JSON.parse(readFileSync("/tmp/conflict-flagged.json","utf8")).filter(f=>f.conflicts>=2).map(f=>f.id); }catch{}
const ids=[...new Set([...sus.map(r=>r.id),...scan])].filter(id=>id!==6542);
console.log("대상:",ids.length,"곳 (의심",sus.length,"+ 스캔",scan.length,")");

let cleaned=0, held=0, nochange=0, totDrop=0;
for(const id of ids){
  try{
    const c=(await sql`SELECT id,name,area,dong,raw_reviews FROM cafes WHERE id=${id}`)[0];
    if(!c?.raw_reviews?.length){ continue; }
    const loc=[c.area,c.dong].filter(Boolean).join(" ");
    const cp=placeOf(c.area); const nm=norm(c.name);
    const raw=c.raw_reviews;
    const g=raw.filter(r=>r.source==="google").map(r=>({text:r.text,time:r.time}));
    const mk=(s)=>raw.filter(r=>r.source===s).map(r=>({text:r.text,title:r.title,desc:r.desc,time:r.time,link:r.link,date:r.date,source:r.srcName}));
    const sources=[]; if(g.length)sources.push({source:"google",texts:g}); const b=mk("blog"); if(b.length)sources.push({source:"blog",texts:b}); const y=mk("youtube"); if(y.length)sources.push({source:"youtube",texts:y});
    const r=collectAndSynthesize(c.name, loc?[loc]:[], sources, {});
    const items=r.auditItems||[];
    // 결정적 drop: 팝업/대형venue, 또는 카페명에 없는 다른 구/시
    const dec={}; let drop=0;
    for(const it of items){
      const k=it.key||""; const body=(it.title||"")+" "+(it.body||"");
      let bad=false;
      if((POP.test(k)||VENUE.test(k)) && !POP.test(nm) && !VENUE.test(nm)) bad=true;
      if(!bad && cp){ for(const p of placesIn(body)){ if(p!==cp){ const tok=p.split(":")[1]; if(!nm.includes(tok)) { bad=true; break; } } } }
      if(bad){ dec[k]=false; drop++; }
    }
    if(!drop){ nochange++; continue; }
    totDrop+=drop;
    const res=await applyDecisions({id:c.id,name:c.name,area:loc}, dec);
    if(res?.published) cleaned++; else { held++; await sql`UPDATE cafes SET pipeline_status='held' WHERE id=${c.id} AND NOT published`; }
  }catch(e){ console.log(`  ✗ #${id}: ${String(e.message||e).slice(0,50)}`); }
}
console.log(`결과 — 교정공개 ${cleaned} · 근거부족보류 ${held} · 변화없음 ${nochange} · 총drop ${totDrop}`);
// 의심 재확인
const after=(await sql`SELECT COUNT(*) FILTER (WHERE NOT g.grounded)::int n FROM grounding_checks g JOIN cafes c ON c.id=g.cafe_id WHERE c.published AND g.checked_at>=c.synth_updated AND c.llm_judged_at IS NOT NULL AND c.llm_judged_at>=c.raw_collected_at`)[0];
console.log("정리 후 현재 의심(suspectCount):", after.n);
process.exit(0);
