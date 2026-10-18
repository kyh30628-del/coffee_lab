// ⚖️ 판정 모델 비교 — **비싼 모델을 쓸 값어치가 있는지 재고 나서 결정한다.** (2026-10-18)
//
// CEO 지시: "예산 안에서 전부 돌려. 판정을 위해 조금 더 높은 모델을 써야되면 예산 안에서는 써도 된다."
//
// 📏 공식 단가(platform.claude.com/docs/en/about-claude/pricing, 2026-10-18 확인) · 배치는 입·출력 모두 50% 할인
//     Haiku 5.5   $0.10 / $0.50   → 배치 $0.05 / $0.25
//     Haiku 4.5   $0.50 / $2.50   → 배치 $0.25 / $1.25   ⚠️ 코드에 박힌 상수는 '정가의 50%'로 이미 반영된 값이다
//     Sonnet 5    $2    / $10     → 배치 $1    / $5
//     Opus 5.5    $4    / $20     → 배치 $2    / $10
//   ⚠️ 단가를 모르는 모델은 쓰지 않는다(추정 금지).
//
// 🔴 첫 시도가 실패했다(비용 $0.093 헛씀) — 저장된 Haiku 판정의 키와 지금 만든 후보의 키가 **안 맞았다**.
//   판정 후 그 카페들이 **재합성**되면서 후기 구성이 바뀌었기 때문이다. "같은 입력 비교"라는 전제가 깨졌다.
//   → 이번엔 **같은 요청 본문을 두 모델에 동시에** 태워 비교한다(저장된 판정에 의존하지 않는다).
//   재판정 결과는 **적용하지 않는다**(측정 전용 — DB 미반영).
//
// 사용: node --import tsx scripts/judge-model-compare.mjs [--n=20] [--a=claude-haiku-5-5] [--b=claude-sonnet-5]
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { RUBRIC, buildUserText, parseVerdicts } = await import("../lib/reviewJudge.ts");
const { createBatch, getBatch, streamResults } = await import("../lib/anthropicBatch.ts");
const { getAuditCandidates } = await import("../lib/synthStore.ts"); // cron-batch-judge와 같은 출처(비교 성립 조건)
const sql = neon(process.env.DATABASE_URL);
const KEY = process.env.ANTHROPIC_API_KEY;
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const N = Number(arg("n", 20));
const A = arg("a", "claude-haiku-5-5");
const B = arg("b", "claude-sonnet-5");
const PRICE = { // 배치 단가(정가 50%) — 위 공식 표에서 옮긴 값
  "claude-haiku-5-5": { in: 0.05 / 1e6, out: 0.25 / 1e6 },
  "claude-haiku-4-5": { in: 0.25 / 1e6, out: 1.25 / 1e6 },
  "claude-sonnet-5": { in: 1 / 1e6, out: 5 / 1e6 },
  "claude-opus-5-5": { in: 2 / 1e6, out: 10 / 1e6 },
};
for (const m of [A, B]) if (!PRICE[m]) { console.error(`🔴 ${m}의 단가를 모른다 — 중단(추정 금지).`); process.exit(1); }

// 판정 대기 카페에서 표본 — 지금 후보를 새로 만들어 **두 모델에 같은 본문**을 보낸다.
const rows = await sql`SELECT id, name, area FROM cafes
  WHERE (pipeline_status='pending' OR (published AND synth_grade IS DISTINCT FROM '검증'))
    AND raw_reviews IS NOT NULL
    AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at)
  ORDER BY random() LIMIT ${N}`;

const reqs = [], meta = {};
for (const c of rows) {
  const { candidates, hasRaw } = await getAuditCandidates({ id: c.id, name: c.name, area: c.area ?? "" });
  if (!hasRaw) continue;
  const items = candidates.slice(0, 35).filter((it) => it && it.key);
  if (!items.length) continue;
  const content = buildUserText(c.name, c.area ?? "", items.map((it, i) => ({ i, title: it.title || "", body: it.body || "" })));
  meta[c.id] = { name: c.name, keys: items.map((it) => it.key) };
  for (const [tag, model] of [["a", A], ["b", B]]) {
    reqs.push({ custom_id: `${tag}_${c.id}`, params: { model, max_tokens: 1500,
      system: [{ type: "text", text: RUBRIC }], messages: [{ role: "user", content }] } });
  }
}
console.log(`⚖️ 같은 입력 ${Object.keys(meta).length}곳 × 두 모델 = 요청 ${reqs.length}건 (측정 전용 · DB 미반영)`);
console.log(`   A=${A}  B=${B}`);
const b = await createBatch(KEY, reqs, { allowDuplicate: true });
console.log(`   배치 ${b.id} — 완료 대기`);
let st = b;
while (st.processing_status !== "ended") { await new Promise((r) => setTimeout(r, 20_000)); st = await getBatch(KEY, b.id); }

const use = { a: { in: 0, out: 0, n: 0 }, b: { in: 0, out: 0, n: 0 } };
const verdicts = { a: {}, b: {} };
for await (const line of streamResults(KEY, st.results_url)) {
  const [tag, idStr] = String(line.custom_id).split("_");
  const m = meta[idStr]; if (!m || !use[tag]) continue;
  const res = line.result; if (res?.type !== "succeeded") continue;
  const u = res.message?.usage ?? {};
  use[tag].in += u.input_tokens ?? 0; use[tag].out += u.output_tokens ?? 0; use[tag].n++;
  const text = (res.message?.content ?? []).map((p) => p.text ?? "").join("");
  // ⚠️ parseVerdicts는 **인자 1개**를 받고 **항목 인덱스 i로 키를 매긴 Map**을 돌려준다.
  //   채택 판정은 라우트와 동일하게 `about && helpful`이다(cron-batch-judge:68).
  //   처음에 `parseVerdicts(text, keys)`로 부르고 Map을 []로 접근해 **비교 0건**이 두 번 났다
  //   (측정 비용 $0.166 헛씀). 함수를 읽지 않고 추측한 탓이다 — 판정 경로와 같은 호출만 쓴다.
  const mp = parseVerdicts(text);
  const dec = {};
  m.keys.forEach((k, i) => { const v = mp?.get(i); if (v) dec[k] = !!(v.about && v.helpful); });
  verdicts[tag][idStr] = dec;
}
let total = 0, agree = 0, keepA = 0, keepB = 0, bUp = 0, bDown = 0, bothParsed = 0;
for (const id of Object.keys(meta)) {
  const va = verdicts.a[id], vb = verdicts.b[id];
  if (!va || !vb) continue;
  bothParsed++;
  for (const k of meta[id].keys) {
    const x = va[k], y = vb[k];
    if (x === undefined || y === undefined) continue;
    total++;
    if (!!x === !!y) agree++; else if (y && !x) bUp++; else bDown++;
    if (x) keepA++; if (y) keepB++;
  }
}
const cost = (t) => use[t].in * PRICE[t === "a" ? A : B].in + use[t].out * PRICE[t === "a" ? A : B].out;
const perCafe = (t) => cost(t) / Math.max(use[t].n, 1);
console.log(`\n[사용량·비용]`);
for (const [t, m] of [["a", A], ["b", B]])
  console.log(`   ${m.padEnd(20)} 응답 ${use[t].n} · 입력 ${use[t].in.toLocaleString()} · 출력 ${use[t].out.toLocaleString()} · $${cost(t).toFixed(5)} (곳당 $${perCafe(t).toFixed(6)})`);
console.log(`\n[판정 비교] 양쪽 파싱 성공 ${bothParsed}곳 · 비교된 후기 ${total.toLocaleString()}건`);
if (!total) { console.log(`   🔴 비교 0건 — 파싱이 실패했다. 이 측정은 무효다(결론을 내지 않는다).`); process.exit(1); }
console.log(`   일치 ${agree.toLocaleString()}건 (${(agree / total * 100).toFixed(1)}%)`);
console.log(`   채택률  A ${(keepA / total * 100).toFixed(1)}%  ·  B ${(keepB / total * 100).toFixed(1)}%`);
console.log(`   B가 더 살림(A 버림→B 채택) ${bUp}건 · B가 더 버림 ${bDown}건`);
const QUEUE = Number((await sql`SELECT count(*)::int n FROM cafes
  WHERE (pipeline_status='pending' OR (published AND synth_grade IS DISTINCT FROM '검증'))
    AND raw_reviews IS NOT NULL AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at)`)[0].n);
console.log(`\n[전체 ${QUEUE.toLocaleString()}곳 적용 비용]`);
console.log(`   ${A}: $${(perCafe("a") * QUEUE).toFixed(2)}  ·  ${B}: $${(perCafe("b") * QUEUE).toFixed(2)}   (예산 $100)`);
console.log(`\n→ 판단 기준: B가 더 살린 후기가 의미 있게 많고 예산에 들어오면 B를 쓴다.`);
console.log(`   차이가 작으면 싼 모델로 전부 돌리고 남은 예산은 남긴다(낭비 금지).`);
