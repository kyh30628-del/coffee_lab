#!/usr/bin/env node
// 🏷️ 시설 태그 AI 검증 (2026-10-19, CEO 지시 "크레딧으로 의미있는 일")
//
// 왜: 시설 태그는 **키워드 사전**으로 붙는다. 실측 오분류가 주차 53%·단체 83%다.
//   "근처 공영주차장 쓰면 돼요"가 '주차 편함'이 되고, "강아지 데려가고 싶은데 안 된대요"가
//   '반려동물 동반'이 된다. 소비자는 그걸 믿고 차를 끌고 가거나 개를 데려간다 — **우리가 거짓말을 한 셈**이다.
//   규칙으로는 못 푼다(부정어 가드를 더 붙여도 문맥을 못 읽는다). 의미 판단이라 LLM의 자리다.
//
// 🔒 판정과 집행을 분리한다 — 이 스크립트는 **판정만** 하고 facet_verdicts에 쌓는다.
//   실제 태그 제거는 --apply로 따로 집행한다(공개 카페 대량 변경이라 되돌릴 수 있어야 한다).
//
// 💰 Batch API(반값) 고정. 근거 문장만 추려 보내 입력 토큰을 줄인다(카페당 최대 8문장).
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { createBatch, getBatch, streamResults, batchPriceFor } = await import("../lib/anthropicBatch.ts");
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.FACET_MODEL || "claude-haiku-4-5";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const LIMIT = Number(arg("limit", 2500));
const TAGS = (arg("tags", "주차 편함,반려동물 동반")).split(",");
const APPLY = process.argv.includes("--apply");

await sql`CREATE TABLE IF NOT EXISTS facet_verdicts (
  cafe_id INT NOT NULL, tag TEXT NOT NULL,
  ok BOOLEAN,              -- true=근거 있음 / false=근거 없음(제거 대상) / null=모름(건드리지 않음)
  why TEXT, model TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (cafe_id, tag))`;

// ── 집행 모드: 이미 쌓인 판정으로 태그만 제거
if (APPLY) {
  const bad = await sql`SELECT cafe_id, tag FROM facet_verdicts WHERE ok = false AND NOT applied`;
  console.log(`제거 대상 ${bad.length}건`);
  if (!bad.length) process.exit(0);
  const byCafe = new Map();
  for (const r of bad) { const k = Number(r.cafe_id); byCafe.set(k, [...(byCafe.get(k) ?? []), r.tag]); }
  let n = 0;
  for (const [id, tags] of byCafe) {
    await sql`UPDATE cafes SET facets = (SELECT COALESCE(array_agg(f), '{}') FROM unnest(facets) f WHERE f <> ALL(${tags})) WHERE id=${id}`;
    n++;
  }
  await sql`UPDATE facet_verdicts SET applied = true WHERE ok = false AND NOT applied`;
  const { invalidateCafeDetailOnly } = await import("../lib/cafeCacheInvalidate.ts");
  const ids = [...byCafe.keys()];
  for (let i = 0; i < ids.length; i += 50) await invalidateCafeDetailOnly(ids.slice(i, i + 50)).catch(() => {});
  console.log(`✅ ${n}곳 태그 제거 · 캐시 무효화`);
  process.exit(0);
}

// ── 판정 모드
// 🔴 후기 blob은 크다 — 한 번에 수천 곳을 당기면 Neon 응답 한도(67MB)를 넘겨 통째로 실패한다
//   (실측: 2,000곳에서 터졌다). id만 먼저 고르고 본문은 100곳씩 끊어 읽는다. [[feedback_cost_discipline_hard]]
const picks = await sql`SELECT c.id FROM cafes c
  WHERE c.published AND c.facets && ${TAGS}
    AND NOT EXISTS (SELECT 1 FROM facet_verdicts v WHERE v.cafe_id = c.id)
  ORDER BY c.synth_count DESC NULLS LAST LIMIT ${LIMIT}`;
const rows = [];
for (let i = 0; i < picks.length; i += 100) {
  const ids = picks.slice(i, i + 100).map((x) => Number(x.id));
  const part = await sql`SELECT id, name, COALESCE(synth_reviews_all, synth_reviews, '[]'::jsonb) rv, facets
    FROM cafes WHERE id = ANY(${ids})`;
  rows.push(...part);
}
console.log(`대상 ${rows.length}곳 (태그: ${TAGS.join(" · ")})`);
if (!rows.length) process.exit(0);

// 🔴 2026-10-19 사고 — 처음엔 여기에 단서 단어를 **손으로 적었다.** 2종만 적힌 탓에 나머지 태그는
//   근거 문장을 하나도 못 찾고 "근거 0건 = 거짓"으로 자동 처리됐다(2차 12종 전부 100% 거짓).
//   손으로 적는 한 **태그를 붙인 사전과 어긋날 수밖에 없다.** 그래서 붙일 때 쓰는 그 사전
//   (lib/cafeProfile.ts의 HIGHLIGHTS)에서 **직접 끌어온다** — 단일 출처.
const { HIGHLIGHTS } = await import("../lib/cafeProfile.ts");
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CUE = Object.fromEntries(HIGHLIGHTS.map((h) => [h.label, new RegExp(h.kws.map(esc).join("|"))]));
const reqs = [];
const tagsOf = new Map();   // 파싱 실패 시에도 기록을 남기려면 '무엇을 물었는지'를 들고 있어야 한다
for (const r of rows) {
  const mine = (r.facets ?? []).filter((f) => TAGS.includes(f));
  if (!mine.length) continue;
  const quotes = (Array.isArray(r.rv) ? r.rv : []).map((x) => String(x?.quote ?? ""))
    .filter((q) => mine.some((t) => CUE[t]?.test(q))).slice(0, 8);
  if (!quotes.length) {   // 근거 문장이 하나도 없으면 LLM 없이 제거 대상(사전이 잘못 붙인 것)
    for (const t of mine) await sql`INSERT INTO facet_verdicts (cafe_id, tag, ok, why, model)
      VALUES (${r.id}, ${t}, false, '근거 문장 0건', 'rule') ON CONFLICT DO NOTHING`;
    continue;
  }
  tagsOf.set(Number(r.id), mine);
  reqs.push({ custom_id: `c${r.id}`, params: { model: MODEL, max_tokens: Math.min(1200, 220 + mine.length * 180), messages: [{ role: "user", content:
`카페 "${r.name}"의 공개 후기 발췌다. 아래 태그가 **이 카페의 시설로서 사실인지** 판정하라.

태그: ${mine.join(" / ")}

발췌:
${quotes.map((q, i) => `${i + 1}. ${q}`).join("\n")}

규칙:
- "근처 공영주차장", "주변에 주차하면 된다" 처럼 **남의 주차장**이면 거짓이다.
- "주차가 어렵다/협소하다/전쟁이다" 는 거짓이다.
- "강아지는 안 된다", "반려동물 동반 불가" 는 거짓이다. 테라스만 가능도 참으로 본다.
- 발췌에 판단 근거가 없으면 "모름"이다. 추측하지 마라.

JSON만 출력: {"판정":[{"태그":"...","값":"참"|"거짓"|"모름","근거":"발췌의 한 구절"}]}` }] } });
}
console.log(`LLM 판정 ${reqs.length}건 제출`);
if (!reqs.length) process.exit(0);
const batch = await createBatch(KEY, reqs, { allowDuplicate: true });
console.log(`배치 ${batch.id}`);
let b = batch;
while (b.processing_status !== "ended") { await new Promise((s) => setTimeout(s, 20000)); b = await getBatch(KEY, batch.id); process.stdout.write("."); }
console.log("\n수거");
const price = batchPriceFor(MODEL);
let tin = 0, tout = 0, ok = 0, ng = 0, unk = 0;
for await (const res of streamResults(KEY, b.results_url)) {
  const id = Number(String(res.custom_id).slice(1));
  const msg = res?.result?.message; if (!msg) continue;
  tin += msg.usage?.input_tokens ?? 0; tout += msg.usage?.output_tokens ?? 0;
  const txt = (msg.content ?? []).map((c) => c.text ?? "").join("");
  // 🔴 2026-10-19 실사고 — 출력이 잘려 파싱에 실패하면 **아무 기록도 안 남겨** 같은 카페가
  //   매 회차 다시 뽑혔다(668곳이 20회차를 그대로 돌았다). 판정 레인에서 이미 겪은 함정인데 또 냈다.
  //   "못 읽었다"도 처리 결과다 — ok=null(모름)로 남겨 다시 집지 않게 한다. 태그는 건드리지 않는다.
  const mark = async (why) => { for (const t of (tagsOf.get(id) ?? []))
    await sql`INSERT INTO facet_verdicts (cafe_id, tag, ok, why, model) VALUES (${id}, ${t}, NULL, ${why}, ${MODEL})
      ON CONFLICT (cafe_id, tag) DO NOTHING`; };
  const m = txt.match(/\{[\s\S]*\}/); if (!m) { await mark("출력 파싱 실패"); continue; }
  let j; try { j = JSON.parse(m[0]); } catch { await mark("출력 잘림"); continue; }
  for (const v of j?.판정 ?? []) {
    const val = v?.값 === "참" ? true : v?.값 === "거짓" ? false : null;
    if (val === true) ok++; else if (val === false) ng++; else unk++;
    await sql`INSERT INTO facet_verdicts (cafe_id, tag, ok, why, model)
      VALUES (${id}, ${String(v?.태그 ?? "")}, ${val}, ${String(v?.근거 ?? "").slice(0, 200)}, ${MODEL})
      ON CONFLICT (cafe_id, tag) DO UPDATE SET ok=EXCLUDED.ok, why=EXCLUDED.why, at=now()`;
  }
}
const cost = tin * price.in + tout * price.out;   // BATCH_PRICES는 이미 '토큰당' 단가다(1e6으로 또 나누면 0이 된다)
console.log(`참 ${ok} · 거짓 ${ng} · 모름 ${unk}  |  토큰 ${tin}/${tout}  비용 $${cost.toFixed(4)}`);
console.log(`거짓 비율 ${(ng / Math.max(1, ok + ng + unk) * 100).toFixed(1)}%  → 적용은 --apply`);
