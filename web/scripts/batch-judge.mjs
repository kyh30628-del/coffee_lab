// AI 판정 — Anthropic Batches API 드레인 (50% 할인, 비동기).
//   규칙이 '경계(애매)'로 분류한 리뷰만 Haiku가 일괄 판정 → judge_decisions 저장 → 영향 카페 재합성.
//   동기 경로(reviewJudge.ts)와 '완전히 동일한' RUBRIC·모델·파싱 재사용(드리프트 0).
//   비용: 메터드 종량제(Batches 50%할인). 결과 미과금: errored/expired.
//
// 사용:
//   JUDGE_LIMIT=50  node --import tsx scripts/batch-judge.mjs build   # 후보 추출 + 배치 제출(매니페스트 저장)
//   node --import tsx scripts/batch-judge.mjs poll                    # 처리 상태 확인
//   node --import tsx scripts/batch-judge.mjs apply                   # 결과 수거 → 적용 + 실제 토큰/비용 산출
//   JUDGE_LIMIT=50  node --import tsx scripts/batch-judge.mjs run     # build→폴링→apply 자동(백그라운드용)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("ANTHROPIC_API_KEY 없음 — .env.local에 추가 필요(이게 Batches/판정의 키)"); process.exit(1); }
const MODEL = process.env.JUDGE_MODEL || "claude-haiku-4-5";
const LIMIT = Number(process.env.JUDGE_LIMIT || 50);          // 이번 회차에 판정할 카페 수(파일럿 기본 50)
const PER_CAFE = Number(process.env.JUDGE_PER_CAFE || 35);    // 카페당 경계리뷰 상한(동기 경로와 동일)
const MAX_PER_BATCH = 50000;                                  // 안전 청크(한도 10만/256MB 이내)
const MANIFEST = process.env.JUDGE_MANIFEST || "/tmp/coffee-batch-judge.json";

const { RUBRIC, buildUserText, parseVerdicts } = await import("../lib/reviewJudge.ts");
const { getAuditCandidates, applyDecisions, markJudged } = await import("../lib/synthStore.ts");
const { createBatch, getBatch, streamResults, BATCH_PRICE_IN: PRICE_IN, BATCH_PRICE_OUT: PRICE_OUT } = await import("../lib/anthropicBatch.ts");
const { sql } = await import("../lib/db.ts");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 판정 후보가 있는 카페만 배치 요청으로. 경계 0인 카페는 LLM 불필요 → markJudged(커서 전진).
async function build() {
  const rows = await sql`SELECT id, name, area FROM cafes
    WHERE (published OR pipeline_status='pending') AND raw_reviews IS NOT NULL
      AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at)
    ORDER BY published DESC, id LIMIT ${LIMIT}`;
  console.log(`[build] 판정 대상 후보 카페 ${rows.length} (LIMIT=${LIMIT})`);
  const requests = [];
  const cafes = {};
  let noCand = 0, noRaw = 0;
  for (const c of rows) {
    const { candidates, hasRaw } = await getAuditCandidates({ id: c.id, name: c.name, area: c.area ?? "" });
    if (!hasRaw) { noRaw++; continue; }
    const items = candidates.slice(0, PER_CAFE);
    if (items.length === 0) { await markJudged(c.id); noCand++; continue; } // 경계 없음 → 판정완료 마킹
    const judgeItems = items.map((it, i) => ({ i, title: it.title || "", body: it.body || "" }));
    requests.push({
      custom_id: `cafe_${c.id}`,
      params: {
        model: MODEL, max_tokens: 1500,
        system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildUserText(c.name, c.area ?? "", judgeItems) }],
      },
    });
    cafes[`cafe_${c.id}`] = { id: c.id, name: c.name, area: c.area ?? "", keys: items.map((it) => it.key) };
  }
  console.log(`  경계리뷰 있는 카페(배치행) ${requests.length} · 경계없음(즉시 판정완료) ${noCand} · raw없음 ${noRaw}`);
  if (requests.length === 0) { console.log("  제출할 요청 없음(전부 경계없음 처리). 종료."); return null; }
  // 청크 제출(보통 1배치). 매니페스트에 배치ID들 + 카페→keys 매핑 저장.
  const batchIds = [];
  for (let i = 0; i < requests.length; i += MAX_PER_BATCH) {
    const chunk = requests.slice(i, i + MAX_PER_BATCH);
    const b = await createBatch(KEY, chunk);
    batchIds.push(b.id);
    console.log(`  배치 제출: ${b.id} (${chunk.length}건) status=${b.processing_status}`);
  }
  const manifest = { batchIds, cafes, count: requests.length, model: MODEL };
  writeFileSync(MANIFEST, JSON.stringify(manifest));
  console.log(`  매니페스트 저장: ${MANIFEST}`);
  return manifest;
}

async function poll(quiet) {
  if (!existsSync(MANIFEST)) { console.error("매니페스트 없음 — 먼저 build 실행"); process.exit(1); }
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  let allEnded = true;
  const agg = { processing: 0, succeeded: 0, errored: 0, canceled: 0, expired: 0 };
  for (const id of manifest.batchIds) {
    const b = await getBatch(KEY, id);
    if (b.processing_status !== "ended") allEnded = false;
    for (const k in agg) agg[k] += b.request_counts?.[k] ?? 0;
    if (!quiet) console.log(`  ${id}: ${b.processing_status} ${JSON.stringify(b.request_counts)}`);
  }
  if (!quiet) console.log(`[poll] 종합: ${allEnded ? "✅ 전부 완료(apply 가능)" : "⏳ 처리중"} ${JSON.stringify(agg)}`);
  return { allEnded, manifest, agg };
}

async function apply() {
  const { allEnded, manifest } = await poll(true);
  if (!allEnded) { console.log("[apply] 아직 처리중 — poll로 확인 후 재시도."); return; }
  let appliedCafes = 0, rescued = 0, errored = 0, published = 0;
  let inTok = 0, outTok = 0;
  for (const id of manifest.batchIds) {
    const b = await getBatch(KEY, id);
    for await (const res of streamResults(KEY, b.results_url)) {
      const entry = manifest.cafes[res.custom_id];
      if (!entry) continue;
      if (res.result?.type !== "succeeded") { errored++; continue; } // 미과금 — 다음 회차 재시도
      const u = res.result.message?.usage; if (u) { inTok += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); outTok += u.output_tokens || 0; }
      const text = res.result.message?.content?.find((x) => x.type === "text")?.text || "";
      const verdicts = parseVerdicts(text); // Map i->{about,helpful}
      const decisions = {};
      entry.keys.forEach((k, i) => { const v = verdicts?.get(i); decisions[k] = !!(v && v.about && v.helpful); });
      try {
        const r = await applyDecisions({ id: entry.id, name: entry.name, area: entry.area }, decisions);
        appliedCafes++;
        rescued += Object.values(decisions).filter(Boolean).length;
        if (r?.published) published++;
      } catch (e) { if (errored < 5) console.log(`  ✗ apply ${entry.name}: ${String(e).slice(0, 70)}`); errored++; }
    }
  }
  const cost = inTok * PRICE_IN + outTok * PRICE_OUT;
  console.log(`[apply] 적용 카페 ${appliedCafes} · 살린 리뷰(keep 판정) ${rescued} · 공개상태 ${published} · 실패/미과금 ${errored}`);
  console.log(`[비용] 입력 ${inTok.toLocaleString()}tok · 출력 ${outTok.toLocaleString()}tok → 실제 ≈ $${cost.toFixed(4)} (Haiku Batches 50%)`);
  console.log(`[환산] 전체 백로그(~5,740곳)로 외삽 시 ≈ $${(cost / Math.max(appliedCafes, 1) * 5740).toFixed(2)} 예상`);
}

const mode = process.argv[2] || "build";
if (mode === "build") { await build(); }
else if (mode === "poll") { await poll(false); }
else if (mode === "apply") { await apply(); }
else if (mode === "run") {
  const m = await build();
  if (m) {
    console.log("[run] 폴링 시작(60s 간격)...");
    for (let i = 0; i < 90; i++) { // 최대 90분
      await sleep(60000);
      const { allEnded } = await poll(false);
      if (allEnded) break;
    }
    await apply();
  }
} else { console.error(`알 수 없는 모드: ${mode} (build|poll|apply|run)`); process.exit(1); }
process.exit(0);
