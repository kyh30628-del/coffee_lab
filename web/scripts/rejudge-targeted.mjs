// 타깃 재판정 — 지정 카페들을 무컷·동단위·팝업가드로 재판정. 그라운딩 의심 + 스캔충돌 통합.
//   build|poll|apply|run. ANTHROPIC_API_KEY(Batches). 대상: grounding 의심 전체 + /tmp/conflict-flagged.json(≥2).
import { readFileSync, writeFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-haiku-4-5";
const MANIFEST = "/tmp/rejudge-targeted.json";
const { JUDGE_RUBRIC, buildJudgePrompt, parseJudgeVerdicts } = await import("./_judge-rubric.mjs");
const { createBatch, getBatch, streamResults, BATCH_PRICE_IN: PIN, BATCH_PRICE_OUT: POUT } = await import("../lib/anthropicBatch.ts");
const { applyDecisions } = await import("../lib/synthStore.ts");
const { collectAndSynthesize } = await import("../lib/collectOrchestrator.ts");
const { sql } = await import("../lib/db.ts");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 다른 venue(팝업/타지점) 결정적 가드 — LLM이 같은 브랜드라 관대하게 살린 것 차단
const OTHER_VENUE = (k) => { const s = k || ""; return (/팝업|임시본점|임시매장/.test(s)) || /롯데월드몰|롯데백화점|신세계백화점|현대백화점|스타필드/.test(s); };

async function targetIds() {
  const sus = await sql`SELECT DISTINCT c.id FROM grounding_checks g JOIN cafes c ON c.id=g.cafe_id WHERE NOT g.grounded AND c.published AND g.checked_at>=c.synth_updated AND c.llm_judged_at IS NOT NULL AND c.llm_judged_at>=c.raw_collected_at`;
  let scan = [];
  try { scan = JSON.parse(readFileSync("/tmp/conflict-flagged.json","utf8")).filter(f=>f.conflicts>=2).map(f=>f.id); } catch {}
  const ids = [...new Set([...sus.map(r=>r.id), ...scan])];
  return ids;
}
async function build() {
  const ids = await targetIds();
  console.log(`[build] 대상 ${ids.length}곳 (그라운딩의심 + 스캔≥2)`);
  const requests = [], cafes = {}; let berr=0;
  for (const id of ids) {
    try {
      const c = (await sql`SELECT id,name,area,dong,raw_reviews FROM cafes WHERE id=${id}`)[0];
      if (!c?.raw_reviews?.length) continue;
      const loc = [c.area, c.dong].filter(Boolean).join(" ");
      const raw = c.raw_reviews;
      const g = raw.filter(r=>r.source==="google").map(r=>({text:r.text,time:r.time}));
      const mk=(s)=>raw.filter(r=>r.source===s).map(r=>({text:r.text,title:r.title,desc:r.desc,time:r.time,link:r.link,date:r.date,source:r.srcName}));
      const sources=[]; if(g.length)sources.push({source:"google",texts:g}); const b=mk("blog"); if(b.length)sources.push({source:"blog",texts:b}); const y=mk("youtube"); if(y.length)sources.push({source:"youtube",texts:y});
      const r = collectAndSynthesize(c.name, loc?[loc]:[], sources, {});
      const items = (r.auditItems || []).slice(0, 300);
      if (!items.length) continue;
      const judgeItems = items.map((it,i)=>({i,title:it.title||"",body:it.body||""}));
      const maxTok = Math.min(8000, 700 + judgeItems.length*18);
      requests.push({ custom_id:`cafe_${c.id}`, params:{ model:MODEL, max_tokens:maxTok, system:[{type:"text",text:JUDGE_RUBRIC,cache_control:{type:"ephemeral"}}], messages:[{role:"user",content:buildJudgePrompt(c.name,loc,judgeItems)}] } });
      cafes[`cafe_${c.id}`] = { id:c.id, name:c.name, area:loc, keys: items.map(it=>it.key) };
    } catch(e){ if(berr++<5) console.log(`  ✗ #${id}: ${String(e.message||e).slice(0,50)}`); }
  }
  console.log(`  배치행 ${requests.length}`);
  if(!requests.length){ console.log("  대상 없음"); return null; }
  let bt=null;
  for(let attempt=1;attempt<=6;attempt++){
    try{ bt = await createBatch(KEY, requests); break; }
    catch(e){ console.log(`  배치생성 시도 ${attempt} 실패: ${String(e.message||e).slice(0,70)}`); if(attempt<6) await sleep(8000*attempt); }
  }
  if(!bt){ console.log("  배치생성 6회 실패 — 중단"); return null; }
  writeFileSync(MANIFEST, JSON.stringify({ batchId: bt.id, cafes }));
  console.log(`  배치 제출: ${bt.id} (${requests.length}건) ${bt.processing_status}`);
  return bt.id;
}
async function poll(){ const m=JSON.parse(readFileSync(MANIFEST,"utf8")); const b=await getBatch(KEY,m.batchId); console.log(`[poll] ${b.processing_status} ${JSON.stringify(b.request_counts)}`); return {ended:b.processing_status==="ended",m}; }
async function apply(){
  const {ended,m}=await poll(); if(!ended){console.log("아직 처리중");return;}
  const b=await getBatch(KEY,m.batchId);
  let done=0,clean=0,held=0,guard=0,inTok=0,outTok=0;
  for await (const res of streamResults(KEY,b.results_url)){
    const e=m.cafes[res.custom_id]; if(!e) continue;
    if(res.result?.type!=="succeeded") continue;
    const u=res.result.message?.usage; if(u){inTok+=(u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0);outTok+=u.output_tokens||0;}
    const text=res.result.message?.content?.find(x=>x.type==="text")?.text||"";
    const arr=parseJudgeVerdicts(text); const byI=new Map();
    if(Array.isArray(arr)) for(const v of arr) if(typeof v?.i==="number") byI.set(v.i,v);
    const decisions={};
    e.keys.forEach((k,i)=>{ const v=byI.get(i); let keep=!!(v&&v.about&&v.helpful); if(keep&&OTHER_VENUE(k)){keep=false;guard++;} decisions[k]=keep; });
    try{ const r=await applyDecisions({id:e.id,name:e.name,area:e.area},decisions); done++; if(r?.published)clean++; else {held++; await sql`UPDATE cafes SET pipeline_status='held' WHERE id=${e.id} AND NOT published`;} }
    catch(err){ held++; }
  }
  const cost=inTok*PIN+outTok*POUT;
  console.log(`[apply] 재판정 ${done} · 공개유지 ${clean} · 근거부족보류 ${held} · 팝업가드drop ${guard}`);
  console.log(`[비용] in ${inTok.toLocaleString()} out ${outTok.toLocaleString()} ≈ $${cost.toFixed(4)} (Batches)`);
}
const mode=process.argv[2]||"run";
if(mode==="build")await build();
else if(mode==="poll")await poll();
else if(mode==="apply")await apply();
else { const id=await build(); if(id){ console.log("[run] 폴링..."); for(let i=0;i<90;i++){ await sleep(60000); const {ended}=await poll(); if(ended)break; } await apply(); } }
process.exit(0);
