// 무료 정리 v2 — 위치/팝업 + '고유명 부재' 결정적 제거. 카페 고유명(지점접미사 제거)이 리뷰에 없으면 drop.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { collectAndSynthesize } = await import("../lib/collectOrchestrator.ts");
const { applyDecisions } = await import("../lib/synthStore.ts");
const { sql } = await import("../lib/db.ts");

const SEOUL_GU=["강남","강동","강북","강서","관악","광진","구로","금천","노원","도봉","동대문","동작","마포","서대문","서초","성동","성북","송파","양천","영등포","용산","은평","종로","중랑"];
const CITIES=["남양주","의정부","동두천","수원","성남","고양","용인","부천","안양","안산","화성","평택","시흥","파주","김포","광명","군포","오산","이천","양주","구리","안성","포천","의왕","하남","여주","과천","인천"];
const POP=/팝업|임시본점|임시매장/; const VENUE=/롯데월드몰|롯데백화점|신세계백화점|현대백화점|스타필드|롯데타워|아브뉴프랑/;
const placeOf=(a)=>{ if(!a)return null; const s=String(a); const g=s.match(/([가-힣]{1,3})구/); if(g&&SEOUL_GU.includes(g[1]))return"gu:"+g[1]; for(const c of CITIES)if(s.includes(c))return"city:"+c; return null; };
const placesIn=(q)=>{ const o=new Set(); if(!q)return o; for(const m of q.matchAll(/([가-힣]{1,3})구(?![가-힣])/g))if(SEOUL_GU.includes(m[1]))o.add("gu:"+m[1]); for(const c of CITIES){const re=new RegExp("(?<![가-힣])"+c+"시?(?![가-힣])");if(re.test(q))o.add("city:"+c);} return o; };
const norm=(s)=>String(s||"").replace(/\s/g,"");
// 고유명: 지점접미사(○○점/○역/지명) 제거. 예 "봉명동내커피 금천독산점"→"봉명동내커피"
function distinctName(name){ let n=String(name||"").trim();
  n=n.replace(/\s*[가-힣A-Za-z0-9]*점$/,"");        // 끝 '○○점' 제거
  n=n.replace(/\s*\S+(역|동|읍|면|리|구|시|로|길)$/,""); // 끝 위치어 제거
  n=n.trim(); return norm(n).length>=3 ? norm(n) : norm(name); }

const sus=await sql`SELECT DISTINCT c.id FROM grounding_checks g JOIN cafes c ON c.id=g.cafe_id WHERE NOT g.grounded`;
let scan=[]; try{ scan=JSON.parse(readFileSync("/tmp/conflict-flagged.json","utf8")).filter(f=>f.conflicts>=2).map(f=>f.id); }catch{}
const ids=[...new Set([...sus.map(r=>r.id),...scan])].filter(id=>id!==6542);
console.log("v2 대상:",ids.length);

let pub=0,held=0,drops=0;
for(const id of ids){ try{
  const c=(await sql`SELECT id,name,area,dong,raw_reviews FROM cafes WHERE id=${id}`)[0];
  if(!c?.raw_reviews?.length) continue;
  const loc=[c.area,c.dong].filter(Boolean).join(" "); const cp=placeOf(c.area); const nm=norm(c.name); const dn=distinctName(c.name);
  const raw=c.raw_reviews;
  const g=raw.filter(r=>r.source==="google").map(r=>({text:r.text,time:r.time}));
  const mk=(s)=>raw.filter(r=>r.source===s).map(r=>({text:r.text,title:r.title,desc:r.desc,time:r.time,link:r.link,date:r.date,source:r.srcName}));
  const sources=[]; if(g.length)sources.push({source:"google",texts:g}); const b=mk("blog"); if(b.length)sources.push({source:"blog",texts:b}); const y=mk("youtube"); if(y.length)sources.push({source:"youtube",texts:y});
  const r=collectAndSynthesize(c.name, loc?[loc]:[], sources, {});
  const items=r.auditItems||[]; const dec={}; let d=0;
  for(const it of items){ const k=it.key||""; const body=norm((it.title||"")+(it.body||""));
    let bad=false;
    if((POP.test(it.title+it.body)||VENUE.test(it.title+it.body))&&!POP.test(nm)&&!VENUE.test(nm)) bad=true;
    if(!bad&&cp){ for(const p of placesIn((it.title||"")+(it.body||""))){ if(p!==cp){const tok=p.split(":")[1]; if(!nm.includes(tok)){bad=true;break;}} } }
    if(!bad && dn.length>=3 && !body.includes(dn)) bad=true; // 고유명 부재 → drop
    if(bad){ dec[k]=false; d++; }
  }
  if(!d) continue; drops+=d;
  const res=await applyDecisions({id:c.id,name:c.name,area:loc}, dec);
  if(res?.published) pub++; else { held++; await sql`UPDATE cafes SET published=false, pipeline_status='\''held'\'' WHERE id=${c.id} AND NOT published`; }
}catch(e){ console.log(`✗#${id} ${String(e.message||e).slice(0,40)}`); } }
console.log(`v2 — 교정공개 ${pub} · 보류 ${held} · 총drop ${drops}`);
const after=(await sql`SELECT COUNT(*) FILTER (WHERE NOT g.grounded)::int n FROM grounding_checks g JOIN cafes c ON c.id=g.cafe_id WHERE c.published AND g.checked_at>=c.synth_updated AND c.llm_judged_at IS NOT NULL AND c.llm_judged_at>=c.raw_collected_at`)[0];
console.log("v2 후 현재 의심:", after.n);
process.exit(0);
