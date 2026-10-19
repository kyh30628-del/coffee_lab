// 🔬 AI 귀속 판정이 규칙 '검증'을 대체할 수 있나 — 정확도 측정. (2026-10-19)
//
// 왜 이게 가장 큰 레버인가:
//   공개 게이트는 **"제목이 이 카페인 글(검증) 1건"** 을 요구한다. 이건 귀속(이 글이 이 카페 얘기인가)의
//   **정규식 대용품**이다. 실측 2026-10-19: 미공개 큐의 **85.4%가 주제 글 0건**이라 이 조건에서 막힌다.
//   그런데 AI 판정은 이미 `about=true/false`로 **내용을 읽고 귀속을 판단**한다 — 원리적으로 정규식보다 낫다.
//   09-24 실측 정확도: 규칙 '검증' **82%** · '참고' 59%.
//   ⇒ **AI의 about 판정이 82% 이상이면** 게이트를 AI 귀속으로 대체할 근거가 생기고,
//     미공개 22,282곳이 후보로 돌아온다. 오늘 찾은 가장 큰 레버다.
//
// 어떻게 재는가(순환논리를 피한다):
//   ⓐ **일치율**: 규칙이 '검증'으로 본 후기를 AI에 물어 about=true가 나오는 비율.
//      규칙 '검증'은 82% 정확하므로, AI가 여기서 크게 어긋나면 AI를 믿을 수 없다.
//   ⓑ **추가 발견**: 같은 카페의 '경계' 후기 중 AI가 about=true로 보는 비율.
//      규칙이 놓친 귀속을 AI가 얼마나 찾아내는가 = 게이트를 열었을 때 기대 효과.
//   ⓒ **표본 제시**: ⓑ에서 AI가 살린 글의 제목·본문을 그대로 출력한다.
//      CEO가 눈으로 보고 "이게 이 카페 얘기인가"를 직접 판정할 수 있게 — 내 주장이 아니라 증거로 올린다.
//
// 💰 측정 전용 · DB 미변경. 비용은 원장에 기록한다.
// 사용: node --import tsx scripts/attribution-accuracy-probe.mjs [--n=150]
import { readFileSync, writeFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { loadLearnedTerms } = await import("../lib/learnedTerms.ts");
const { loadCriteriaLists } = await import("../lib/criteriaLists.ts");
await loadLearnedTerms().catch(() => {});
await loadCriteriaLists().catch(() => {});
const { RUBRIC, buildUserText, parseVerdicts, judgeMaxTokens } = await import("../lib/reviewJudge.ts");
const { createBatch, getBatch, streamResults, batchPriceFor } = await import("../lib/anthropicBatch.ts");
const { collectAndSynthesize } = await import("../lib/collectOrchestrator.ts");
const { cleanCafeName } = await import("../lib/reviewQuality.ts");
const { areaTermsFor } = await import("../lib/synthStore.ts");
const sql = neon(process.env.DATABASE_URL);
const KEY = process.env.ANTHROPIC_API_KEY;
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const N = Number(arg("n", 150));
const MODEL = arg("model", "claude-sonnet-5");
const n = (v) => Number(v ?? 0).toLocaleString();
const price = batchPriceFor(MODEL);
const [sp] = await sql`SELECT COALESCE(sum(cost_usd),0)::float s FROM judge_spend`;
console.log(`🔬 AI 귀속 정확도 측정 — 표본 ${n(N)}곳 · ${MODEL} · 누적 $${sp.s.toFixed(2)}/100`);

// 표본: **규칙이 주제 글을 찾은 공개 카페**(= 정답 기준이 있는 쪽). 사람이 본 카페 우선.
const { BOT_ANON_IDS_SQL } = await import("../lib/behaviorBot.ts");
const rows = (await sql.query(`WITH vw AS (
    SELECT substring(path from '^/c/([0-9]+)')::bigint id, count(*)::int pv
    FROM traffic_events WHERE ts > now() - interval '90 day' AND path LIKE '/c/%'
      AND anon_id NOT IN (${BOT_ANON_IDS_SQL}) GROUP BY 1)
  SELECT c.id, c.name, c.area, COALESCE(v.pv,0) pv
  FROM cafes c LEFT JOIN vw v ON v.id = c.id
  WHERE c.published AND c.raw_reviews IS NOT NULL
    AND COALESCE((c.synth_quality->>'verified')::int,0) >= 1
    AND COALESCE(c.borderline_count,0) > 0
  ORDER BY COALESCE(v.pv,0) DESC, c.synth_count DESC LIMIT ${N}`));
console.log(`   표본 ${n(rows.length)}곳(규칙이 주제 글을 찾은 공개 카페)`);

const reqs = [], meta = {};
for (const c of rows) {
  try {
    const [row] = await sql`SELECT raw_reviews, naver_category, address FROM cafes WHERE id=${c.id}`;
    const raw = row?.raw_reviews ?? []; if (!raw.length) continue;
    const area = await areaTermsFor(c.id, c.area);
    const srcs = [{ source: "blog", texts: raw.map((r) => ({ title: r.title ?? "", text: r.text ?? "", desc: r.desc ?? "", link: r.link, date: r.date, source: r.srcName })) }];
    const res = collectAndSynthesize(cleanCafeName(c.name), area, srcs, { naverCategory: row?.naver_category ?? "", address: row?.address ?? "" });
    const blKeys = new Set((res.borderline ?? []).map((b) => b.key));
    // ⓐ 규칙 '검증'으로 본 글 = auditItems 중 경계가 아니고, 규칙이 verified로 본 것.
    //    verdict는 auditItems에 안 실려 있으므로 '경계 아님'을 채택으로 보고, 그중 제목에 상호가 든 것을
    //    규칙 '검증'의 근사로 쓴다(규칙 verified의 정의 그대로).
    const nm = cleanCafeName(c.name).replace(/\s+/g, "");
    const accepted = (res.auditItems ?? []).filter((a) => !blKeys.has(a.key));
    const ruleVerified = accepted.filter((a) => String(a.title ?? "").replace(/\s+/g, "").includes(nm)).slice(0, 8);
    const borderline = (res.borderline ?? []).slice(0, 8);
    if (!ruleVerified.length || !borderline.length) continue;
    const items = [...ruleVerified.map((a) => ({ ...a, kind: "ruleVerified" })),
                   ...borderline.map((a) => ({ ...a, kind: "borderline" }))]
      .map((a, i) => ({ i, title: a.title || "", body: a.body || "", kind: a.kind }));
    meta[`a_${c.id}`] = { id: c.id, name: c.name, pv: c.pv, items };
    reqs.push({ custom_id: `a_${c.id}`, params: { model: MODEL, max_tokens: judgeMaxTokens(items.length),
      system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserText(c.name, c.area ?? "", items.map((x) => ({ i: x.i, title: x.title, body: x.body }))) }] } });
  } catch { /* 한 곳 실패가 측정을 막지 않는다 */ }
}
const nRV = Object.values(meta).reduce((a, m) => a + m.items.filter((x) => x.kind === "ruleVerified").length, 0);
const nBL = Object.values(meta).reduce((a, m) => a + m.items.filter((x) => x.kind === "borderline").length, 0);
console.log(`   요청 ${n(reqs.length)}곳 · 규칙'검증' 후기 ${n(nRV)}건 + 경계 후기 ${n(nBL)}건`);
if (!reqs.length) { console.log("   대상 없음"); process.exit(0); }
const b = await createBatch(KEY, reqs, { allowDuplicate: true });
console.log(`   배치 ${b.id} — 완료 대기`);
let st = b;
while (st.processing_status !== "ended") { await new Promise((r) => setTimeout(r, 20_000)); st = await getBatch(KEY, b.id); }

let inT = 0, outT = 0;
let rvTot = 0, rvAbout = 0, blTot = 0, blAbout = 0, blAboutHelpful = 0;
const found = [];
for await (const r of streamResults(KEY, st.results_url)) {
  if (r.result?.type !== "succeeded") continue;
  const m = meta[r.custom_id]; if (!m) continue;
  const u = r.result.message?.usage ?? {};
  inT += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  outT += u.output_tokens || 0;
  const v = parseVerdicts(r.result.message?.content?.find((x) => x.type === "text")?.text || "");
  if (!v) continue;
  for (const it of m.items) {
    const d = v.get(it.i); if (!d) continue;
    if (it.kind === "ruleVerified") { rvTot++; if (d.about) rvAbout++; }
    else {
      blTot++;
      if (d.about) blAbout++;
      if (d.about && d.helpful) { blAboutHelpful++;
        if (found.length < 14) found.push({ cafe: m.name, pv: m.pv, reason: String(d.reason ?? "").slice(0, 36),
          title: String(it.title).slice(0, 62), body: String(it.body).slice(0, 120) }); }
    }
  }
}
const cost = inT * price.in + outT * price.out;
console.log(`\n═══ 결과 (실비용 $${cost.toFixed(4)}) ═══`);
console.log(`ⓐ 규칙'검증' 후기 ${n(rvTot)}건 → AI about=true **${(rvAbout / Math.max(rvTot, 1) * 100).toFixed(1)}%** (${n(rvAbout)}건)`);
console.log(`   판정선: 규칙'검증' 정확도 82%(09-24 실측). AI가 이보다 높게 일치하면 **AI 귀속이 최소한 동급**이다.`);
console.log(`ⓑ 경계 후기 ${n(blTot)}건 → AI about=true ${(blAbout / Math.max(blTot, 1) * 100).toFixed(1)}% · about+helpful ${(blAboutHelpful / Math.max(blTot, 1) * 100).toFixed(1)}%`);
console.log(`   = 규칙이 놓친 귀속을 AI가 찾아낸 비율. 게이트를 AI 귀속으로 열면 기대되는 효과.`);
console.log(`\nⓒ [AI가 "이 카페 얘기이고 도움된다"고 본 경계 후기 — CEO가 직접 판정하실 증거]`);
for (const f of found) console.log(`   ${String(f.cafe).slice(0, 14).padEnd(14)} · ${f.reason}\n      「${f.title}」\n      ${f.body}`);
writeFileSync("/tmp/attribution-found.json", JSON.stringify(found, null, 1));
await sql`INSERT INTO judge_spend (cafes, rescued, in_tok, out_tok, cost_usd, batch_id, note)
  VALUES (${reqs.length}, ${blAboutHelpful}, ${inT}, ${outT}, ${cost}, ${b.id}, ${'귀속정확도측정'})`;
console.log(`\n   원장 기록(누적 $${(sp.s + cost).toFixed(4)}/100)`);
