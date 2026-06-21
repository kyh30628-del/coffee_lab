// 보류(held) 카페 복원 — Anthropic Batches. 각 카페의 '규칙통과 근거 전체(auditItems)'를 LLM이 건별 판정 →
//   틀린 리뷰(다른 지점/업체) 제거 → 재합성 → 통과(검증/참고+근거충분)하면 재공개, 아니면 보류 유지.
//   구독 토큰 안 씀(ANTHROPIC_API_KEY=Batches). build|poll|apply|run.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("ANTHROPIC_API_KEY 없음"); process.exit(1); }
const MODEL = "claude-haiku-4-5";
const LIMIT = Number(process.env.RESTORE_LIMIT || 5000);
const PER = Number(process.env.RESTORE_PER || 300);  // ★ 후보 전체 판정(조용한 40컷 제거 — 리뷰 많은 카페의 타지점 리뷰가 판정 누락되던 결함)
const MANIFEST = "/tmp/restore-held.json";

const { JUDGE_RUBRIC, buildJudgePrompt, parseJudgeVerdicts } = await import("./_judge-rubric.mjs");
const { createBatch, getBatch, streamResults, BATCH_PRICE_IN: PIN, BATCH_PRICE_OUT: POUT } = await import("../lib/anthropicBatch.ts");
const { applyDecisions } = await import("../lib/synthStore.ts");
const { collectAndSynthesize } = await import("../lib/collectOrchestrator.ts");
const { sql } = await import("../lib/db.ts");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function build() {
  // ⚠️ raw_reviews를 한 번에 SELECT하면 64MB 초과(507)로 죽음 → id만 받고 카페별로 raw 로드.
  const rows = await sql`SELECT id, name, area, dong FROM cafes WHERE pipeline_status='held' AND raw_reviews IS NOT NULL ORDER BY id LIMIT ${LIMIT}`;
  console.log(`[build] 보류 카페 ${rows.length} 복원 판정 빌드`);
  const requests = [], cafes = {};
  let berrs = 0;
  for (const c of rows) {
    try {
      const loc = [c.area, c.dong].filter(Boolean).join(" ");  // ★ 동까지 → 같은 구 안의 다른 지점도 구분
      const raw = (await sql`SELECT raw_reviews FROM cafes WHERE id=${c.id}`)[0]?.raw_reviews || [];
      if (!raw.length) continue;
      const g = raw.filter(r=>r.source==="google").map(r=>({text:r.text,time:r.time}));
      const mk=(s)=>raw.filter(r=>r.source===s).map(r=>({text:r.text,title:r.title,desc:r.desc,time:r.time,link:r.link,date:r.date,source:r.srcName}));
      const sources=[]; if(g.length)sources.push({source:"google",texts:g}); const b=mk("blog"); if(b.length)sources.push({source:"blog",texts:b}); const y=mk("youtube"); if(y.length)sources.push({source:"youtube",texts:y});
      const r = collectAndSynthesize(c.name, loc?[loc]:[], sources, {});
      const items = (r.auditItems || []).slice(0, PER);
      if (!items.length) continue;
      const judgeItems = items.map((it, i) => ({ i, title: it.title || "", body: it.body || "" }));
      const maxTok = Math.min(8000, 700 + judgeItems.length * 18);  // 후보 수만큼 판정 JSON 출력 여유(전체 판정 시 2000으론 잘림)
      requests.push({ custom_id: `cafe_${c.id}`, params: { model: MODEL, max_tokens: maxTok, system: [{ type: "text", text: JUDGE_RUBRIC, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: buildJudgePrompt(c.name, loc, judgeItems) }] } });
      cafes[`cafe_${c.id}`] = { id: c.id, name: c.name, area: loc, keys: items.map(it => it.key) };
    } catch (e) { if (berrs++ < 3) console.log(`  ✗ #${c.id} ${c.name}: ${String(e.message||e).slice(0,60)}`); }
  }
  if (berrs) console.log(`  빌드 중 스킵(에러) ${berrs}곳`);
  console.log(`  배치행 ${requests.length}`);
  if (!requests.length) { console.log("  대상 없음"); return null; }
  const b = await createBatch(KEY, requests);
  writeFileSync(MANIFEST, JSON.stringify({ batchId: b.id, cafes }));
  console.log(`  배치 제출: ${b.id} (${requests.length}건) ${b.processing_status}`);
  return b.id;
}
async function poll() {
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const b = await getBatch(KEY, m.batchId);
  console.log(`[poll] ${b.processing_status} ${JSON.stringify(b.request_counts)}`);
  return { ended: b.processing_status === "ended", m };
}
async function apply() {
  const { ended, m } = await poll();
  if (!ended) { console.log("아직 처리중"); return; }
  const b = await getBatch(KEY, m.batchId);
  let done=0, republished=0, stillHeld=0, inTok=0, outTok=0;
  for await (const res of streamResults(KEY, b.results_url)) {
    const e = m.cafes[res.custom_id]; if (!e) continue;
    if (res.result?.type !== "succeeded") continue;
    const u=res.result.message?.usage; if(u){inTok+=(u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0); outTok+=u.output_tokens||0;}
    const text = res.result.message?.content?.find(x=>x.type==="text")?.text||"";
    const arr = parseJudgeVerdicts(text); const byI=new Map();
    if(Array.isArray(arr)) for(const v of arr) if(typeof v?.i==="number") byI.set(v.i,v);
    const decisions={}; e.keys.forEach((k,i)=>{const v=byI.get(i); decisions[k]=!!(v&&v.about&&v.helpful);});
    // 보류 해제 → 재합성이 규칙대로 공개 판단(틀린 리뷰 제거 후 검증/참고+근거충분이면 재공개)
    await sql`UPDATE cafes SET pipeline_status=NULL WHERE id=${e.id}`;
    try { const r = await applyDecisions({id:e.id,name:e.name,area:e.area}, decisions); done++; if(r?.published) republished++; else { stillHeld++; await sql`UPDATE cafes SET pipeline_status='held' WHERE id=${e.id} AND NOT published`; } }
    catch(err){ stillHeld++; await sql`UPDATE cafes SET pipeline_status='held' WHERE id=${e.id}`; }
  }
  const cost=inTok*PIN+outTok*POUT;
  console.log(`[apply] 복원판정 ${done} · 재공개 ${republished} · 보류유지(근거부족) ${stillHeld}`);
  console.log(`[비용] 입력 ${inTok.toLocaleString()} 출력 ${outTok.toLocaleString()} → ≈ $${cost.toFixed(4)} (Batches)`);
}
const mode = process.argv[2] || "run";
if (mode==="build") await build();
else if (mode==="poll") await poll();
else if (mode==="apply") await apply();
else { const id=await build(); if(id){ console.log("[run] 폴링..."); for(let i=0;i<90;i++){ await sleep(60000); const {ended}=await poll(); if(ended)break; } await apply(); } }
process.exit(0);
