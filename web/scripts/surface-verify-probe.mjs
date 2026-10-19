// 🔬 소비자 화면 요소 검증 — 규칙(키워드)이 만든 표시를 AI가 후기로 대조한다. (2026-10-19)
//
// CEO 지시: "제대로 세밀하게 다 수행해 … 전부 다 오늘 진행해."
//
// 왜: 공개 49,294곳의 화면은 거의 전부 **규칙(정규식·키워드)** 산물이고 AI가 검증한 적이 없다.
//   ① 시설 패싯 — 주차 12,027 · 반려동물 8,162 · 단체 5,561 · 루프탑 5,553곳.
//      🔴 "주차 편함"이 틀리면 소비자가 차를 들고 **헛걸음**한다. 서비스 신뢰 직결.
//   ② 정체성 문장 — '자주 언급' 주장 25,435곳(그중 후기 6건 미만 3,344곳). 화면 **첫 줄**의 거짓 주장.
//   ③ 특징 점수 — 산미·바디·단맛 49,294곳. 어휘 매칭이라 커피 묘사가 틀리면 전문성이 무너진다.
//
// 어떻게: 카페별로 **노출 중인 후기**를 근거로 주고 "이 표시가 후기로 뒷받침되나"를 묻는다.
//   LLM은 **판정만** 한다(생성 금지 — PRINCIPLES §1·§5). 표시를 바꾸지 않고 **오분류율만** 먼저 잰다.
// 💰 측정 전용 · DB 미변경 · 비용은 원장에 기록.
// 사용: node --import tsx scripts/surface-verify-probe.mjs [--n=500] [--model=claude-haiku-5-5]
import { readFileSync, writeFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { loadLearnedTerms } = await import("../lib/learnedTerms.ts");
const { loadCriteriaLists } = await import("../lib/criteriaLists.ts");
await loadLearnedTerms().catch(() => {});
await loadCriteriaLists().catch(() => {});
const { createBatch, getBatch, streamResults, batchPriceFor } = await import("../lib/anthropicBatch.ts");
const { BOT_ANON_IDS_SQL } = await import("../lib/behaviorBot.ts");
const sql = neon(process.env.DATABASE_URL);
const KEY = process.env.ANTHROPIC_API_KEY;
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const N = Number(arg("n", 500));
const MODEL = arg("model", "claude-haiku-5-5");
const n = (v) => Number(v ?? 0).toLocaleString();
const price = batchPriceFor(MODEL);
const [sp] = await sql`SELECT COALESCE(sum(cost_usd),0)::float s FROM judge_spend`;

const RUBRIC = `너는 카페 정보 검수관이다. 아래에 ①그 카페의 **노출 중인 후기 발췌**와 ②우리가 화면에 표시하고 있는 정보를 준다.
후기만을 근거로 각 표시가 **뒷받침되는지** 판정한다. 후기에 근거가 없으면 false다(추측 금지).

판정 항목:
- facets: 표시 중인 시설·특징 태그 각각에 대해 true(후기가 뒷받침)/false(근거 없음)/contra(후기가 반대로 말함).
  예) "주차 편함"인데 후기에 "주차가 어렵다"가 있으면 contra.
- identity: 화면 첫 줄 문장이 후기로 뒷받침되는가. 특히 "자주 언급된다" 같은 **빈도 주장**은
  실제로 여러 후기가 그 얘기를 할 때만 true다.
- taste: 산미/바디/단맛 표시가 후기의 맛 서술과 어긋나지 않는가(언급이 없으면 unknown).

반드시 JSON으로만 답한다(설명·코드블록 금지):
{"facets":{"태그명":"true|false|contra", ...},"identity":"true|false","identityWhy":"15자 이내","taste":"ok|mismatch|unknown"}`;

// 🔴 2026-10-19 **측정 설계 수리** — 1차 측정이 거짓이었다.
//   1차: AI에게 **노출 인용문 10건(각 220자)** 만 주고 패싯·정체성이 뒷받침되는지 물었다.
//        결과 "주차 편함 오분류 82% · 단체·모임룸 94% · 정체성 97.5%"가 나왔다.
//   🔴 그런데 패싯은 `extractFacets(verifiedTexts)` — **검증된 후기 원문 전체**에서 뽑힌다
//      (lib/collectOrchestrator.ts:421). 정체성도 전체 후기로 합성한다.
//      즉 "내가 준 10개 발췌에 근거가 없다"를 "표시가 틀렸다"로 읽은 것이다. **측정이 거짓이었다.**
//   → 2차: 패싯 산출과 **같은 입력**(검증 후기 원문)을 준다. 그래야 비교가 성립한다.
//     비용은 토큰이 늘지만 Haiku 5.5라 곳당 몇 십 분의 1센트다.
const rows = (await sql.query(`WITH vw AS (
    SELECT substring(path from '^/c/([0-9]+)')::bigint id, count(*)::int pv
    FROM traffic_events WHERE ts > now() - interval '90 day' AND path LIKE '/c/%'
      AND anon_id NOT IN (${BOT_ANON_IDS_SQL}) GROUP BY 1)
  SELECT c.id, c.name, c.facets, c.synth_identity, c.char_scores, c.synth_reviews, c.synth_count,
         COALESCE(v.pv,0) pv
  FROM cafes c LEFT JOIN vw v ON v.id = c.id
  WHERE c.published AND c.facets IS NOT NULL AND array_length(c.facets,1) > 0
    AND jsonb_array_length(COALESCE(c.synth_reviews,'[]'::jsonb)) >= 2
  ORDER BY COALESCE(v.pv,0) DESC, c.synth_count DESC LIMIT ${N}`));
console.log(`🔬 화면 요소 검증 — 표본 ${n(rows.length)}곳 · ${MODEL} · 누적 $${sp.s.toFixed(2)}/100`);

const { collectAndSynthesize } = await import("../lib/collectOrchestrator.ts");
const { cleanCafeName } = await import("../lib/reviewQuality.ts");
const { areaTermsFor } = await import("../lib/synthStore.ts");
const reqs = [], meta = {};
for (const c of rows) {
  // 패싯 산출과 **같은 입력**을 만든다: collectAndSynthesize가 쓰는 검증 후기 원문.
  let quotes = "";
  try {
    const [rr] = await sql`SELECT raw_reviews, naver_category, address FROM cafes WHERE id=${c.id}`;
    const raw = rr?.raw_reviews ?? [];
    if (raw.length) {
      const area = await areaTermsFor(c.id, c.area);
      const srcs = [{ source: "blog", texts: raw.map((r) => ({ title: r.title ?? "", text: r.text ?? "", desc: r.desc ?? "", link: r.link, date: r.date, source: r.srcName })) }];
      const res = collectAndSynthesize(cleanCafeName(c.name), area, srcs, { naverCategory: rr?.naver_category ?? "", address: rr?.address ?? "" });
      const texts = (res.evidenceReviews ?? []).map((e) => e?.quote).filter(Boolean);
      const all = (res.allEvidence ?? []).map((e) => e?.quote).filter(Boolean);
      const pool = (all.length ? all : texts);
      quotes = pool.slice(0, 25).map((t, i) => `#${i + 1} ${String(t).slice(0, 300)}`).join("\n");
    }
  } catch { /* 한 곳 실패가 측정을 막지 않는다 */ }
  if (!quotes.trim()) quotes = (c.synth_reviews ?? []).slice(0, 10).map((r, i) => `#${i + 1} ${String(r.quote ?? r.text ?? "").slice(0, 220)}`).join("\n");
  if (!quotes.trim()) continue;
  const cs = c.char_scores ?? {};
  const body = `카페: "${c.name}"\n\n[검증된 후기(패싯 산출과 같은 입력)]\n${quotes}\n\n[화면 표시]\n`
    + `facets: ${JSON.stringify(c.facets)}\n`
    + `identity: "${String(c.synth_identity ?? "").slice(0, 160)}"\n`
    + `taste: 산미 ${cs.acidity ?? "?"} · 바디 ${cs.body ?? "?"} · 단맛 ${cs.sweet ?? "?"} (0~5)`;
  meta[`s_${c.id}`] = { id: c.id, name: c.name, pv: c.pv, facets: c.facets, identity: String(c.synth_identity ?? "") };
  reqs.push({ custom_id: `s_${c.id}`, params: { model: MODEL, max_tokens: 1600,
    system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: body }] } });
}
console.log(`   요청 ${n(reqs.length)}곳`);
if (!reqs.length) { console.log("   대상 없음"); process.exit(0); }
const b = await createBatch(KEY, reqs, { allowDuplicate: true });
console.log(`   배치 ${b.id} — 완료 대기`);
let st = b;
while (st.processing_status !== "ended") { await new Promise((r) => setTimeout(r, 20_000)); st = await getBatch(KEY, b.id); }

let inT = 0, outT = 0, resp = 0, pf = 0;
const fs = {}, idBad = [], tasteMis = [];
for await (const r of streamResults(KEY, st.results_url)) {
  if (r.result?.type !== "succeeded") continue;
  const m = meta[r.custom_id]; if (!m) continue;
  const u = r.result.message?.usage ?? {};
  inT += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  outT += u.output_tokens || 0;
  const text = r.result.message?.content?.find((x) => x.type === "text")?.text || "";
  let j = null;
  try { const mm = text.match(/\{[\s\S]*\}/); j = JSON.parse(mm ? mm[0] : text); } catch { pf++; continue; }
  resp++;
  for (const [tag, val] of Object.entries(j.facets ?? {})) {
    (fs[tag] ??= { t: 0, f: 0, c: 0 });
    if (val === "true") fs[tag].t++; else if (val === "contra") fs[tag].c++; else fs[tag].f++;
  }
  if (String(j.identity) === "false") idBad.push({ cafe: m.name, pv: m.pv, why: String(j.identityWhy ?? "").slice(0, 30), id: m.identity.slice(0, 70) });
  if (j.taste === "mismatch") tasteMis.push({ cafe: m.name, pv: m.pv });
}
const cost = inT * price.in + outT * price.out;
console.log(`\n═══ 결과 (응답 ${n(resp)}곳 · 파싱실패 ${pf} · $${cost.toFixed(4)}) ═══`);
console.log(`\n① 시설 패싯 — 태그별 "후기가 뒷받침하나"`);
const order = Object.entries(fs).sort((a, b) => (b[1].t + b[1].f + b[1].c) - (a[1].t + a[1].f + a[1].c));
for (const [tag, v] of order.slice(0, 14)) {
  const tot = v.t + v.f + v.c;
  const bad = v.f + v.c;
  console.log(`   ${String(tag).slice(0, 14).padEnd(14)} n=${String(tot).padStart(4)} · 뒷받침 ${(v.t / tot * 100).toFixed(0)}% · 🔴근거없음 ${(v.f / tot * 100).toFixed(0)}% · 🔴반대 ${v.c}건 → 오분류 ${(bad / tot * 100).toFixed(0)}%`);
}
console.log(`\n② 정체성 문장 — 후기가 뒷받침 못 하는 곳 ${n(idBad.length)}/${n(resp)} = ${(idBad.length / Math.max(resp, 1) * 100).toFixed(1)}%`);
for (const x of idBad.slice(0, 8)) console.log(`   ${String(x.cafe).slice(0, 14).padEnd(14)} PV${String(x.pv).padStart(3)} · ${x.why}\n      「${x.id}」`);
console.log(`\n③ 특징 점수 — 후기와 어긋남 ${n(tasteMis.length)}/${n(resp)} = ${(tasteMis.length / Math.max(resp, 1) * 100).toFixed(1)}%`);
writeFileSync("/tmp/surface-verify.json", JSON.stringify({ facets: fs, idBad, tasteMis }, null, 1));
await sql`INSERT INTO judge_spend (cafes, rescued, in_tok, out_tok, cost_usd, batch_id, note)
  VALUES (${resp}, ${0}, ${inT}, ${outT}, ${cost}, ${b.id}, ${'화면요소검증'})`;
console.log(`\n   원장 기록(누적 $${(sp.s + cost).toFixed(4)}/100) · 상세 /tmp/surface-verify.json`);
