// 🧾 AI 판정 계산서 — **쓰기 전에** $100 크레딧으로 몇 곳을 판정할 수 있는지 정확히 계산한다. (2026-10-18)
//
// 왜 추정이 아니라 계산인가:
//   CEO 절대규칙 — 비용은 착수 전에 실측으로 내놓는다. 2026-08-28에 같은 배치를 3번 사서 $2.60을 태운 이력이 있다.
//   토큰은 **공식 count_tokens API(무과금)** 로 센다. 글자수÷1.5 같은 어림은 쓰지 않는다.
//
// 단가: lib/anthropicBatch.ts의 BATCH_PRICE_IN/OUT (Haiku 4.5 Batches = 정가 50%)
//   ⚠️ 모델을 바꾸면 단가도 바꿔야 한다. 단가를 모르는 모델로 바꾸지 않는다.
//
// 사용: node --import tsx scripts/judge-estimate.mjs [--sample=8]
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { RUBRIC, buildUserText, CLAUDE_MODEL } = await import("../lib/reviewJudge.ts");
const { BATCH_PRICE_IN, BATCH_PRICE_OUT } = await import("../lib/anthropicBatch.ts");
const sql = neon(process.env.DATABASE_URL);
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("🔴 ANTHROPIC_API_KEY 미설정"); process.exit(1); }

const SAMPLE = Number((process.argv.find((a) => a.startsWith("--sample=")) ?? "").split("=")[1] || 8);
const PER_CAFE = 35;              // cron-batch-judge와 동일
const MAX_TOKENS = 1500;          // 동일
const n = (v) => Number(v ?? 0).toLocaleString();

// 판정 대상 = cron-batch-judge와 **같은 큐**(judgeQueueCount 정의). 정의가 갈라지면 계산서가 거짓이 된다.
const total = Number((await sql`SELECT count(*)::int n FROM cafes
  WHERE (pipeline_status='pending' OR (published AND synth_grade IS DISTINCT FROM '검증'))
    AND raw_reviews IS NOT NULL
    AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at)`)[0].n);

// 표본으로 실제 요청을 만들어 **공식 API로 토큰을 센다**(무과금).
const rows = await sql`SELECT name, area, raw_reviews FROM cafes
  WHERE (pipeline_status='pending' OR (published AND synth_grade IS DISTINCT FROM '검증'))
    AND raw_reviews IS NOT NULL
    AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at)
  ORDER BY random() LIMIT ${SAMPLE}`;

let inSum = 0, items = 0, measured = 0;
for (const c of rows) {
  const snips = (c.raw_reviews ?? []).slice(0, PER_CAFE)
    .map((r, i) => ({ key: `k${i}`, title: r?.title ?? "", text: r?.text ?? r?.desc ?? "" }));
  if (!snips.length) continue;
  const body = {
    model: CLAUDE_MODEL,
    system: [{ type: "text", text: RUBRIC }],
    messages: [{ role: "user", content: buildUserText(c.name, c.area ?? "", snips) }],
  };
  const r = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) { console.error(`🔴 count_tokens 실패 ${r.status}: ${(await r.text()).slice(0, 160)}`); process.exit(1); }
  const j = await r.json();
  inSum += Number(j.input_tokens ?? 0); items += snips.length; measured++;
}
if (!measured) { console.error("🔴 표본을 만들지 못했다"); process.exit(1); }

const avgIn = inSum / measured;
const avgItems = items / measured;
// 출력은 항목당 짧은 판정(키+keep/drop+사유)이다. **보수적으로 max_tokens 전부**를 쓴다고 가정한다 —
//   계산서는 과소추정이 위험하다(초과 지출). 실제 소비는 이보다 적게 나온다.
const worstOut = MAX_TOKENS;
const perCafeWorst = avgIn * BATCH_PRICE_IN + worstOut * BATCH_PRICE_OUT;
const BUDGET = Number(process.env.JUDGE_BUDGET_USD || 100);

console.log(`🧾 AI 판정 계산서 — ${CLAUDE_MODEL} · Batches(정가 50%)`);
console.log(`   단가: 입력 $${(BATCH_PRICE_IN * 1e6).toFixed(2)}/MTok · 출력 $${(BATCH_PRICE_OUT * 1e6).toFixed(2)}/MTok`);
console.log(`\n[실측 — 공식 count_tokens, 무과금]`);
console.log(`   표본 ${measured}곳 · 카페당 후기 ${avgItems.toFixed(1)}건(상한 ${PER_CAFE})`);
console.log(`   카페당 입력 토큰 평균 ${n(Math.round(avgIn))}`);
console.log(`   카페당 비용(출력을 max_tokens ${n(MAX_TOKENS)} 전부 쓴다고 **보수 가정**) $${perCafeWorst.toFixed(5)}`);
console.log(`\n[예산 $${BUDGET} 기준]`);
console.log(`   판정 가능 카페 수(보수) ${n(Math.floor(BUDGET / perCafeWorst))}곳`);
console.log(`   판정 대기 전체 ${n(total)}곳 → 전부 처리 비용(보수) $${(total * perCafeWorst).toFixed(2)}`);
const pct = (total * perCafeWorst) / BUDGET * 100;
console.log(`   예산 소요율 ${pct.toFixed(1)}%  ${pct <= 100 ? "✅ 예산 안에서 전부 가능" : "🔴 예산 초과 — 대상을 좁혀야 한다"}`);
console.log(`\n⚠️ 실제 출력 토큰은 max_tokens보다 적게 나온다 → 실비용은 위 값보다 낮다(과소추정 방지용 보수 계산).`);
