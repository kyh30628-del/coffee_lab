// LLM 그라운딩 — Anthropic Batches API 드레인 (50% 할인, 비동기).
//   판정 끝난 카페의 '생성 정체성'이 근거 후기로 뒷받침되는지(업체혼동·환각만) 일괄 검사.
//   verify-grounding.mjs(구독 OAuth)와 '완전히 동일한' SYS·파싱 재사용. 결과 → grounding_checks.
//   의심(grounded=false) 카페는 llm_judged_at=NULL로 판정 재투입(자가치유). 미과금: errored/expired.
//
// 사용:
//   GROUNDING_LIMIT=50 node --import tsx scripts/batch-grounding.mjs build|poll|apply|run
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("ANTHROPIC_API_KEY 없음 — .env.local에 추가 필요"); process.exit(1); }
const MODEL = process.env.GROUNDING_MODEL || "claude-haiku-4-5";
const LIMIT = Number(process.env.GROUNDING_LIMIT || 50);
const MAX_PER_BATCH = 50000;
const MANIFEST = process.env.GROUNDING_MANIFEST || "/tmp/coffee-batch-grounding.json";

const { GROUNDING_SYS, buildGroundingPrompt, parseGrounding } = await import("./_grounding-rubric.mjs");
const { createBatch, getBatch, streamResults, BATCH_PRICE_IN: PRICE_IN, BATCH_PRICE_OUT: PRICE_OUT } = await import("../lib/anthropicBatch.ts");
const { sql } = await import("../lib/db.ts");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 판정 완료(llm_judged_at >= raw_collected_at) + 정체성·근거 있는 카페 중, 미검사 or 합성 후 stale만.
async function build() {
  await sql`CREATE TABLE IF NOT EXISTS grounding_checks (cafe_id INT PRIMARY KEY, grounded BOOLEAN, issue TEXT, checked_at TIMESTAMPTZ DEFAULT now())`;
  const rows = await sql`
    SELECT c.id, c.name, c.synth_identity, c.synth_reviews FROM cafes c
    LEFT JOIN grounding_checks g ON g.cafe_id = c.id
    WHERE (c.published OR c.pipeline_status = 'held') AND c.synth_identity IS NOT NULL
      AND c.synth_reviews IS NOT NULL AND jsonb_array_length(c.synth_reviews) > 0
      AND c.llm_judged_at IS NOT NULL AND c.llm_judged_at >= c.raw_collected_at
      AND (g.checked_at IS NULL OR g.checked_at < c.synth_updated)
    ORDER BY (g.grounded = false AND c.synth_updated > g.checked_at) DESC, g.checked_at ASC NULLS FIRST
    LIMIT ${LIMIT}`;
  console.log(`[build] 그라운딩 대상 ${rows.length} (LIMIT=${LIMIT}, 판정완료+미검사/stale)`);
  const requests = [];
  const cafes = {};
  let noQuote = 0;
  for (const c of rows) {
    const quotes = (c.synth_reviews || []).map((r) => r.quote).filter(Boolean).slice(0, 6);
    if (!quotes.length) { noQuote++; continue; }
    requests.push({
      custom_id: `cafe_${c.id}`,
      params: {
        model: MODEL, max_tokens: 300,
        system: [{ type: "text", text: GROUNDING_SYS, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildGroundingPrompt(c.name, c.synth_identity, quotes) }],
      },
    });
    cafes[`cafe_${c.id}`] = { id: c.id, name: c.name };
  }
  console.log(`  배치행 ${requests.length} · 인용없음 ${noQuote}`);
  if (requests.length === 0) { console.log("  제출할 요청 없음. 종료."); return null; }
  const batchIds = [];
  for (let i = 0; i < requests.length; i += MAX_PER_BATCH) {
    const chunk = requests.slice(i, i + MAX_PER_BATCH);
    const b = await createBatch(KEY, chunk);
    batchIds.push(b.id);
    console.log(`  배치 제출: ${b.id} (${chunk.length}건) status=${b.processing_status}`);
  }
  writeFileSync(MANIFEST, JSON.stringify({ batchIds, cafes, count: requests.length, model: MODEL }));
  console.log(`  매니페스트 저장: ${MANIFEST}`);
  return true;
}

async function poll(quiet) {
  if (!existsSync(MANIFEST)) { console.error("매니페스트 없음 — 먼저 build"); process.exit(1); }
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  let allEnded = true;
  const agg = { processing: 0, succeeded: 0, errored: 0, canceled: 0, expired: 0 };
  for (const id of manifest.batchIds) {
    const b = await getBatch(KEY, id);
    if (b.processing_status !== "ended") allEnded = false;
    for (const k in agg) agg[k] += b.request_counts?.[k] ?? 0;
    if (!quiet) console.log(`  ${id}: ${b.processing_status} ${JSON.stringify(b.request_counts)}`);
  }
  if (!quiet) console.log(`[poll] ${allEnded ? "✅ 완료(apply 가능)" : "⏳ 처리중"} ${JSON.stringify(agg)}`);
  return { allEnded, manifest };
}

async function apply() {
  const { allEnded, manifest } = await poll(true);
  if (!allEnded) { console.log("[apply] 아직 처리중 — poll로 확인 후 재시도."); return; }
  let checked = 0, flagged = 0, errored = 0, inTok = 0, outTok = 0;
  const flags = [];
  for (const id of manifest.batchIds) {
    const b = await getBatch(KEY, id);
    for await (const res of streamResults(KEY, b.results_url)) {
      const entry = manifest.cafes[res.custom_id];
      if (!entry) continue;
      if (res.result?.type !== "succeeded") { errored++; continue; }
      const u = res.result.message?.usage; if (u) { inTok += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); outTok += u.output_tokens || 0; }
      const text = res.result.message?.content?.find((x) => x.type === "text")?.text || "";
      const v = parseGrounding(text);
      if (!v) { errored++; continue; }
      const grounded = v.grounded !== false;
      const issue = String(v.issue || "").slice(0, 200);
      await sql`INSERT INTO grounding_checks (cafe_id, grounded, issue, checked_at) VALUES (${entry.id}, ${grounded}, ${issue}, now())
        ON CONFLICT (cafe_id) DO UPDATE SET grounded = ${grounded}, issue = ${issue}, checked_at = now()`;
      checked++;
      if (!grounded) {
        flagged++; if (flags.length < 20) flags.push(`${entry.name}: ${issue}`);
        // 자가치유: 업체혼동·환각 의심 → 판정 큐 재투입(다음 batch-judge가 본문 재심사)
        await sql`UPDATE cafes SET llm_judged_at = NULL WHERE id = ${entry.id}`;
      }
    }
  }
  const cost = inTok * PRICE_IN + outTok * PRICE_OUT;
  console.log(`[apply] 검사 ${checked}곳 · 환각/혼동 의심 ${flagged}곳(판정 재투입됨) · 실패/미과금 ${errored}`);
  if (flags.length) { console.log("의심 샘플:"); flags.forEach((f) => console.log(`  ⚠ ${f}`)); }
  console.log(`[비용] 입력 ${inTok.toLocaleString()}tok · 출력 ${outTok.toLocaleString()}tok → 실제 ≈ $${cost.toFixed(4)} (Haiku Batches 50%)`);
  console.log(`[환산] 전체(~6,180곳) 외삽 시 ≈ $${(cost / Math.max(checked, 1) * 6180).toFixed(2)}`);
}

const mode = process.argv[2] || "build";
if (mode === "build") { await build(); }
else if (mode === "poll") { await poll(false); }
else if (mode === "apply") { await apply(); }
else if (mode === "run") {
  const ok = await build();
  if (ok) {
    console.log("[run] 폴링 시작(60s 간격)...");
    for (let i = 0; i < 90; i++) { await sleep(60000); const { allEnded } = await poll(false); if (allEnded) break; }
    await apply();
  }
} else { console.error(`알 수 없는 모드: ${mode}`); process.exit(1); }
process.exit(0);
