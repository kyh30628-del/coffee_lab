// 🤖 AI 판정 집행기 — $100 무료 크레딧 안에서 **낭비 없이** 판정을 돌리고 신규 공개까지 잇는다. (2026-10-18)
//
// CEO 지시(2026-10-18): "Max 요금제가 매월 주는 $100 무료 API 크레딧으로 AI 판정(옥석 가리기)을
//   배치 API로 돌려라. 비용 영향을 항상 경계해 낭비 없이. 실수 없이 검증하고, 검증에 따라 신규 공개도 해라."
//
// 왜 스크립트가 필요한가: 판정 로직·가드는 전부 `app/api/cron-batch-judge`에 있고 **그게 진실원본**이다.
//   여기서는 그 라우트를 **예산 안에서 반복 호출**하고 **지출을 원장에 적는** 일만 한다(로직 복제 금지).
//
// 안전장치(이 순서로 지킨다):
//   ① **예산 하드스톱** — 누적 지출이 한도에 닿으면 제출하지 않는다. 원장은 DB(judge_spend)에 남는다.
//   ② **라우트의 기존 가드를 그대로 쓴다** — 진행 중 배치 있으면 제출 안 됨 · 미적용 매니페스트 카페 제외(멱등)
//      · `submit=1` 명시 필수 · 같은 크기 24h 중복 차단.
//   ③ **수거 먼저, 제출 나중** — 한 사이클은 "수거(무과금) → 비용 기록 → 예산 확인 → 제출 1회"다.
//   ④ 배치가 진행 중이면 **기다린다**(제출을 겹치지 않는다 — 09-20에 112곳 추가 과금한 사고).
//
// 사용:
//   node --import tsx scripts/judge-run.mjs --budget=100 --max-cycles=1   # 1사이클(안전 확인용)
//   node --import tsx scripts/judge-run.mjs --budget=100                  # 예산까지 반복
//   node --import tsx scripts/judge-run.mjs --status                      # 지출·진행 상황만
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const KEY = process.env.ANTHROPIC_API_KEY;
const SECRET = process.env.CRON_SECRET ?? "";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const BASE = arg("base", "http://127.0.0.1:3204");
// 🎯 구간 — rescue(미공개 후보구제: 공개를 늘린다) / refine(공개 재정제: 품질만) / "" (둘 다)
const SCOPE = arg("scope", "");
const BUDGET = Number(arg("budget", 100));
const MAX_CYCLES = Number(arg("max-cycles", 999));
const STATUS_ONLY = process.argv.includes("--status");
const n = (v) => Number(v ?? 0).toLocaleString();

// 📒 지출 원장 — 한 줄에 한 사이클. 누적이 한도에 닿으면 멈춘다(2026-08-28 $2.60 중복과금 사고의 교훈).
await sql`CREATE TABLE IF NOT EXISTS judge_spend (
  id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ DEFAULT now(),
  cafes INT, rescued INT, in_tok BIGINT, out_tok BIGINT, cost_usd NUMERIC(10,5),
  batch_id TEXT, note TEXT)`;

const spentRow = (await sql`SELECT COALESCE(SUM(cost_usd),0)::float s, count(*)::int c FROM judge_spend`)[0];
let spent = Number(spentRow.s);

// 🔑 큐 집계는 **cron-batch-judge의 실제 WHERE와 같아야** 한다.
//   lib/metrics.ts의 judgeQueueCount는 후보구제 분기를 빼고 세어 **과소집계**한다(실측: 24,591 vs 32,470).
//   정의가 갈라지면 "대기 1곳"처럼 보여 판단이 틀어진다 — 실제로 한 번 틀렸다.
const queue = async (scope = "") => Number((await sql`SELECT count(*)::int n FROM cafes
  WHERE raw_reviews IS NOT NULL
    AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at)
    AND (pipeline_status = 'pending'
         OR (published AND synth_grade IS DISTINCT FROM '검증')
         OR (synth_grade = '후보' AND NOT published AND COALESCE(borderline_count,0) > 0
             AND (pipeline_status IS NULL OR pipeline_status NOT IN ('excluded','held','noise'))))
    AND (${scope} = ''
         OR (${scope} = 'rescue' AND NOT COALESCE(published,false))
         OR (${scope} = 'refine' AND COALESCE(published,false)))`)[0].n);
const published = async () => Number((await sql`SELECT count(*)::int n FROM cafes WHERE published`)[0].n);

// 🔴 2026-10-19 — `fetch`로 부르면 **죽는다.** Node의 undici는 응답 헤더를 **300초** 안에 못 받으면
//   `HeadersTimeoutError`를 던진다. 그런데 이 라우트의 수거 단계는 카페마다 재합성을 하므로
//   584곳이면 20분이 넘는다(실측). 집행기가 그 자리에서 죽어 원장 기록과 다음 제출이 멈췄다.
//   → 타임아웃을 끌 수 있는 curl로 부른다(의존성 추가 없음). 서버 작업은 계속 진행되므로
//     집행기만 살아 있으면 멱등 수거로 이어진다.
const { execFile } = await import("node:child_process");
const call = (qs) => new Promise((resolve) => {
  execFile("curl", ["-s", "--max-time", "7200", "-H", `authorization: Bearer ${SECRET}`,
    `${BASE}/api/cron-batch-judge?${qs}`], { maxBuffer: 1 << 24 }, (err, stdout) => {
    if (err) return resolve({ ok: false, raw: String(err.message).slice(0, 200) });
    try { resolve(JSON.parse(stdout)); } catch { resolve({ ok: false, raw: String(stdout).slice(0, 200) }); }
  });
});
const callPlain = (path) => new Promise((resolve) => {
  execFile("curl", ["-s", "--max-time", "1800", "-H", `authorization: Bearer ${SECRET}`,
    `${BASE}${path}`], { maxBuffer: 1 << 24 }, (err, stdout) => {
    if (err) return resolve({});
    try { resolve(JSON.parse(stdout)); } catch { resolve({}); }
  });
});

console.log(`🤖 AI 판정 — 예산 $${BUDGET} · 지금까지 지출 $${spent.toFixed(4)} (사이클 ${spentRow.c}회)`);
console.log(`   판정 대기 ${n(await queue(SCOPE))}곳(구간 ${SCOPE || '전체'}) · 공개 ${n(await published())}곳`);
if (STATUS_ONLY) {
  // ⚠️ 이 표의 시각 컬럼은 `at`이다(`created_at`이 아니다 — 내가 한 번 틀렸다).
  const open = await sql`SELECT batch_id, note, cost_usd, at FROM judge_spend ORDER BY id DESC LIMIT 8`;
  for (const o of open) console.log(`   ${String(o.at).slice(0, 24)} ${String(o.note ?? "").padEnd(14)} $${Number(o.cost_usd ?? 0).toFixed(5)} ${o.batch_id ?? ""}`);
  process.exit(0);
}

for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
  // ── ① 수거(무과금) — 끝난 배치 결과를 적용하고 실제 비용을 받아온다
  const col = await call("manual=1");
  if (!col.ok) {
    // 한 번의 실패로 멈추지 않는다 — 서버는 계속 일하고 수거는 멱등이다(3분 뒤 재시도).
    console.log(`  [${cycle}] ⚠️ 수거 실패(재시도 예정): ${JSON.stringify(col).slice(0, 140)}`);
    await new Promise((r) => setTimeout(r, 180_000));
    continue;
  }
  const a = col.applied ?? {};
  if (Number(a.cafes ?? 0) > 0 || Number(a.costUsd ?? 0) > 0) {
    await sql`INSERT INTO judge_spend (cafes, rescued, in_tok, out_tok, cost_usd, note)
      VALUES (${a.cafes ?? 0}, ${a.rescuedReviews ?? 0}, ${a.inTok ?? 0}, ${a.outTok ?? 0}, ${a.costUsd ?? 0}, ${'수거'})`;
    spent += Number(a.costUsd ?? 0);
    const perCafe = Number(a.cafes) > 0 ? Number(a.costUsd) / Number(a.cafes) : 0;
    console.log(`  [${cycle}] 수거 ${n(a.cafes)}곳 · 구제 ${n(a.rescuedReviews)}건 · $${Number(a.costUsd).toFixed(5)} (곳당 $${perCafe.toFixed(5)}) · 누적 $${spent.toFixed(4)}`);
  }
  // 🔬 정확성 계측(2026-10-19) — **감시자는 감시대상과 같이 멈추면 안 된다.**
  //   라우트가 응답에 실어주는 truncated/parseFailed/unanswered를 매 사이클 눈으로 본다.
  //   0이 아니면 "AI가 못 본 후기"가 생긴 것이다 — 조용히 넘어가지 않게 로그에 🔴로 띄운다.
  //   (잘림은 judgeMaxTokens로 막았고, 미응답은 미결로 남겨 규칙 판정이 가지만, 발생 자체를 봐야 한다.)
  const pr = col.precision ?? {};
  if (Number(pr.truncated ?? 0) || Number(pr.parseFailed ?? 0) || Number(pr.unanswered ?? 0))
    console.log(`  [${cycle}] 🔴 정확성 — 출력잘림 ${n(pr.truncated)}건 · 파싱실패 ${n(pr.parseFailed)}건 · 미응답후보 ${n(pr.unanswered)}건 (미응답은 규칙 판정 유지)`);
  else if (Number(a.cafes ?? 0) > 0)
    console.log(`  [${cycle}] ✅ 정확성 — 잘림·파싱실패·미응답 0건 (제출 후보 전원이 AI 판정을 받았다)`);

  // ── ①-b 공개 승격 — **판정만 하면 공개가 안 된다.**
  //   판정 적용(applyDecisions)은 카페를 `pending`(공개 심사)으로 보낼 뿐이고, 승격은 finalizePipeline이 한다.
  //   그 함수는 cron-embed 안에서만 불린다 → 판정 루프가 승격을 같이 돌려야 "판정 → 공개" 한 바퀴가 닫힌다.
  //   (실측 2026-10-18: 판정 443곳이 적용됐는데 pending 65곳이 쌓이고 공개는 그대로였다.)
  //   💰 비용: 이 호출은 임베딩을 시도하다 실패(크레딧)하지만 과금 0이고, 승격 UPDATE만 남는다.
  try {
    const pj = await callPlain("/api/cron-embed");
    if (Number(pj.promoted ?? 0) > 0 || Number(pj.released ?? 0) > 0)
      console.log(`  [${cycle}] 공개 승격 ${n(pj.promoted ?? 0)}곳 · 보류해제 ${n(pj.released ?? 0)}곳`);
  } catch { /* 승격 실패가 판정 루프를 멈추지 않는다 */ }

  // ── ② 진행 중 배치가 있으면 기다린다(제출 겹치지 않게 — 09-20 사고)
  if (Number(col.pollingBatches ?? 0) > 0) {
    console.log(`  [${cycle}] 진행 중 배치 ${col.pollingBatches}건 — 3분 뒤 다시 수거(제출 안 함)`);
    await new Promise((r) => setTimeout(r, 180_000));
    continue;
  }

  // ── ③ 예산 하드스톱
  if (spent >= BUDGET) { console.log(`\n🛑 예산 도달 — 누적 $${spent.toFixed(4)} / $${BUDGET}. 제출하지 않는다.`); break; }
  const left = await queue(SCOPE);
  if (left === 0) { console.log(`\n✅ 판정 대기 0곳 — 더 살 것이 없다.`); break; }

  // ── ④ 제출 1회(라우트의 BUILD_LIMIT만큼)
  const sub = await call(`manual=1&submit=1${SCOPE ? `&scope=${SCOPE}` : ""}`);
  if (!sub.ok) { console.log(`🔴 제출 실패: ${JSON.stringify(sub).slice(0, 180)}`); break; }
  const s = sub.submitted;
  if (!s || !s.newBatchId) { console.log(`  [${cycle}] 제출 없음 — ${sub.note ?? JSON.stringify(sub).slice(0, 140)}`); break; }
  await sql`INSERT INTO judge_spend (cafes, rescued, in_tok, out_tok, cost_usd, batch_id, note)
    VALUES (0, 0, 0, 0, 0, ${s.newBatchId}, ${'제출 ' + s.cafes + '곳'})`;
  console.log(`  [${cycle}] 제출 ${n(s.cafes)}곳 → ${s.newBatchId} · 남은 대기 ${n(left - s.cafes)}곳`);
  await new Promise((r) => setTimeout(r, 120_000)); // 배치가 끝날 시간을 준다
}

const fin = (await sql`SELECT COALESCE(SUM(cost_usd),0)::float s, COALESCE(SUM(cafes),0)::int c, COALESCE(SUM(rescued),0)::int r FROM judge_spend`)[0];
console.log(`\n📒 누적 — 판정 ${n(fin.c)}곳 · 구제 ${n(fin.r)}건 · 지출 $${Number(fin.s).toFixed(4)} / $${BUDGET}`);
console.log(`   판정 대기 ${n(await queue(SCOPE))}곳(구간 ${SCOPE || '전체'}) · 공개 ${n(await published())}곳`);
