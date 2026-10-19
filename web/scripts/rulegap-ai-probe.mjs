// 🔬 규칙갭 AI 발굴 — **규칙은 통과시켰는데 AI는 거부하는 후기**를 찾는다. (2026-10-19)
//
// CEO 지시: "한도 내에 제발 우리 서비스 품질에 의미있는 일들을 찾아서 해줘. 제대로 사용해야 할 거 아니야."
//
// 왜 이게 레버리지가 가장 큰가:
//   AI 판정은 **1곳당 1회**지만, 규칙 보강은 **공개 49,294곳 전체에 영구 적용**된다.
//   그리고 지금 `cron-rulegap` 에이전트는 **데이터 패턴**으로만 규칙을 발굴한다 —
//   AI가 직접 후기를 읽고 "규칙의 구멍"을 찾는 경로는 **없었다**.
//
// 무엇을 보는가:
//   판정 큐는 '경계(borderline)'만 AI에 보낸다 — 즉 **규칙이 이미 통과시킨 후기는 AI가 본 적이 없다.**
//   그게 소비자 화면에 그대로 노출된다. 거기에 오염이 있으면 우리 해자가 거짓이 된다.
//   → 규칙이 **채택**한 후기(auditItems − borderline)를 AI에 보내 거부되는 것을 수집한다.
//
// 💰 비용: 표본 카페 수 × 곳당 약 $0.006(Sonnet 5 — 정확도가 목적이라 좋은 모델). 기본 2,000곳 ≈ $12.
//   측정 전용이다 — **DB를 바꾸지 않는다.** 결과는 사유별 집계로 보고하고, 규칙 반영은 CEO 승인 후.
//
// 사용: node --import tsx scripts/rulegap-ai-probe.mjs [--n=2000] [--model=claude-sonnet-5]
import { readFileSync, writeFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { loadLearnedTerms } = await import("../lib/learnedTerms.ts");
const { loadCriteriaLists } = await import("../lib/criteriaLists.ts");
await loadLearnedTerms().catch(() => {});
await loadCriteriaLists().catch(() => {});
const { RUBRIC, buildUserText, parseVerdicts, decisionsFromVerdicts, judgeMaxTokens } = await import("../lib/reviewJudge.ts");
const { createBatch, getBatch, streamResults, batchPriceFor } = await import("../lib/anthropicBatch.ts");
const sql = neon(process.env.DATABASE_URL);
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("🔴 ANTHROPIC_API_KEY 미설정"); process.exit(1); }
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const N = Number(arg("n", 2000));
const MODEL = arg("model", "claude-sonnet-5");
const PER_CAFE = Number(arg("per", 20));   // 카페당 채택 후기 표본 상한
const n = (v) => Number(v ?? 0).toLocaleString();

// 🧮 예산 가드 — 집행 전에 계산서를 내고, 남은 예산을 넘으면 중단한다(판정 원장과 같은 $100 한도 공유).
const [sp] = await sql`SELECT COALESCE(sum(cost_usd),0)::float s FROM judge_spend`;
const price = batchPriceFor(MODEL);
console.log(`🔬 규칙갭 AI 발굴 — 표본 ${n(N)}곳 · 모델 ${MODEL} · 카페당 채택후기 최대 ${PER_CAFE}건`);
console.log(`   누적 지출 $${sp.s.toFixed(2)}/100 · 잔여 $${(100 - sp.s).toFixed(2)}`);

// 🎯 표본: **사람이 실제로 보는 공개 카페 우선**(90일 PV) → 그다음 후기 많은 순.
//   오염이 거기 있으면 피해가 제일 크다.
const { BOT_ANON_IDS_SQL } = await import("../lib/behaviorBot.ts");
const rows = (await sql.query(`WITH vw AS (
    SELECT substring(path from '^/c/([0-9]+)')::bigint id, count(*)::int pv
    FROM traffic_events WHERE ts > now() - interval '90 day' AND path LIKE '/c/%'
      AND anon_id NOT IN (${BOT_ANON_IDS_SQL}) GROUP BY 1)
  SELECT c.id, c.name, c.area, c.synth_grade, c.synth_count, COALESCE(v.pv,0) pv
  FROM cafes c LEFT JOIN vw v ON v.id = c.id
  WHERE c.published AND c.raw_reviews IS NOT NULL AND COALESCE(c.synth_count,0) >= 2
  ORDER BY COALESCE(v.pv,0) DESC, c.synth_count DESC
  LIMIT ${N}`));
console.log(`   표본 확보 ${n(rows.length)}곳 (사람이 본 카페 ${n(rows.filter((r) => r.pv > 0).length)}곳 우선)`);

const { areaTermsFor } = await import("../lib/synthStore.ts");
const { collectAndSynthesize } = await import("../lib/collectOrchestrator.ts");
const { cleanCafeName } = await import("../lib/reviewQuality.ts");

// 규칙이 **채택**한 후기만 추린다 = auditItems − borderline
const reqs = [], meta = {};
let built = 0, skipped = 0;
for (const c of rows) {
  try {
    const [row] = await sql`SELECT raw_reviews, naver_category, address FROM cafes WHERE id=${c.id}`;
    const raw = row?.raw_reviews ?? [];
    if (!raw.length) { skipped++; continue; }
    const area = await areaTermsFor(c.id, c.area);
    const srcs = [{ source: "blog", texts: raw.map((r) => ({ title: r.title ?? "", text: r.text ?? "", desc: r.desc ?? "", link: r.link, date: r.date, source: r.srcName })) }];
    // ⚠️ 카테고리·주소를 반드시 넘긴다 — 규칙(verifyReview)이 이 둘로 분기하므로, 빼면 **프로덕션과 다른
    //   채택 집합**이 나와 "규칙이 통과시킨 것"을 재현하지 못한다(측정이 거짓이 된다).
    const res = collectAndSynthesize(cleanCafeName(c.name), area, srcs,
      { naverCategory: row?.naver_category ?? "", address: row?.address ?? "" });
    const blKeys = new Set((res.borderline ?? []).map((b) => b.key));
    const accepted = (res.auditItems ?? []).filter((a) => !blKeys.has(a.key)).slice(0, PER_CAFE);
    if (!accepted.length) { skipped++; continue; }
    const items = accepted.map((a, i) => ({ i, title: a.title || "", body: a.body || "" }));
    meta[`c_${c.id}`] = { id: c.id, name: c.name, pv: c.pv, grade: c.synth_grade, keys: accepted.map((a) => a.key), items };
    reqs.push({ custom_id: `c_${c.id}`, params: { model: MODEL, max_tokens: judgeMaxTokens(items.length),
      system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserText(c.name, (c.area ?? ""), items) }] } });
    built++;
    if (built % 200 === 0) console.log(`   … 빌드 ${built}곳`);
  } catch (e) { skipped++; }
}
console.log(`   빌드 완료 ${n(built)}곳 · 건너뜀 ${n(skipped)}곳 · 심사 대상 후기 ${n(Object.values(meta).reduce((a, m) => a + m.keys.length, 0))}건`);
if (!reqs.length) { console.log("   대상 없음"); process.exit(0); }

const b = await createBatch(KEY, reqs, { allowDuplicate: true });
console.log(`   배치 ${b.id} 제출 — 완료 대기`);
let st = b;
while (st.processing_status !== "ended") { await new Promise((r) => setTimeout(r, 20_000)); st = await getBatch(KEY, b.id); }

let inT = 0, outT = 0, resp = 0, judged = 0, rejected = 0, trunc = 0, pf = 0;
const gaps = [];   // 규칙 통과 · AI 거부
for await (const r of streamResults(KEY, st.results_url)) {
  if (r.result?.type !== "succeeded") continue;
  const m = meta[r.custom_id]; if (!m) continue;
  resp++;
  const u = r.result.message?.usage ?? {};
  inT += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  outT += u.output_tokens || 0;
  if (r.result.message?.stop_reason === "max_tokens") trunc++;
  const text = r.result.message?.content?.find((x) => x.type === "text")?.text || "";
  const v = parseVerdicts(text);
  if (!v) { pf++; continue; }
  m.items.forEach((it) => {
    const d = v.get(it.i); if (!d) return;
    judged++;
    if (!(d.about && d.helpful)) {
      rejected++;
      gaps.push({ cafe: m.name, id: m.id, pv: m.pv, grade: m.grade,
        about: !!d.about, helpful: !!d.helpful, reason: String(d.reason ?? "").slice(0, 40),
        title: String(it.title).slice(0, 60), body: String(it.body).slice(0, 110) });
    }
  });
}
const cost = inT * price.in + outT * price.out;
console.log(`\n═══ 결과 ═══`);
console.log(`   응답 ${n(resp)}곳 · 심사된 후기 ${n(judged)}건 · 잘림 ${trunc} · 파싱실패 ${pf} · 실비용 $${cost.toFixed(4)}`);
console.log(`   🔴 **규칙 통과 · AI 거부 ${n(rejected)}건 = ${(rejected / Math.max(judged, 1) * 100).toFixed(2)}%**`);
const byAbout = gaps.filter((g) => !g.about).length;
console.log(`      그중 귀속 실패(about=false, 다른 가게 얘기) ${n(byAbout)}건 · 품질 미달(helpful=false) ${n(rejected - byAbout)}건`);
// 사유 군집 — 규칙 보강 후보
const cl = {};
for (const g of gaps) { const k = g.reason || "(사유없음)"; cl[k] = (cl[k] ?? 0) + 1; }
console.log(`\n   [AI 거부 사유 상위 — 규칙 보강 후보]`);
for (const [k, v] of Object.entries(cl).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`      ${String(n(v)).padStart(4)}건 ${k}`);
console.log(`\n   [귀속 실패 표본 — 소비자 화면에 다른 가게 후기가 보이는 사례]`);
for (const g of gaps.filter((x) => !x.about).slice(0, 10))
  console.log(`      ${String(g.cafe).slice(0, 16).padEnd(16)} PV${String(g.pv).padStart(3)} ${g.grade} · ${g.reason}\n         「${g.title}」 ${g.body}`);
writeFileSync("/tmp/rulegap-ai-gaps.json", JSON.stringify(gaps, null, 1));
console.log(`\n   전체 ${n(gaps.length)}건을 /tmp/rulegap-ai-gaps.json 에 저장(규칙 보강 설계용)`);
await sql`INSERT INTO judge_spend (cafes, rescued, in_tok, out_tok, cost_usd, batch_id, note)
  VALUES (${resp}, ${0}, ${inT}, ${outT}, ${cost}, ${b.id}, ${'규칙갭AI발굴'})`;
console.log(`   원장 기록 완료(누적 $${(sp.s + cost).toFixed(4)}/100)`);
