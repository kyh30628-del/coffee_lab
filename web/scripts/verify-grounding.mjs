// 🧠 LLM 그라운딩 검사(레드팀 보조 레이어) — Claude Max 구독으로 로컬 실행.
// 시스템이 생성한 카페 '한줄 정체성'이 실제 근거 후기로 뒷받침되는지(=환각 없는지) 검사.
// 결정론적 불변식(cron-verify)이 1차 backbone, 이건 생성문 환각을 잡는 2차 보조 신호.
// 의심분은 자동 조치하지 않고 관리자 'human review'로 표시(LLM도 틀릴 수 있으므로).
// 실행: node scripts/verify-grounding.mjs  (CLAUDE_CODE_OAUTH_TOKEN 필요, ANTHROPIC_API_KEY unset)
import { query } from "@anthropic-ai/claude-agent-sdk";
import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "node:fs";
import { GROUNDING_SYS, buildGroundingPrompt, parseGrounding } from "./_grounding-rubric.mjs";

if (existsSync(new URL("./.ai-paused", import.meta.url))) { console.log("⏸ .ai-paused — 그라운딩 일시정지(Claude 한도 보호)"); process.exit(0); }
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
delete process.env.ANTHROPIC_API_KEY; // ⚠️ 구독 전용 러너 — API키가 있으면 SDK가 종량제로 가버림(과금). 항상 구독(OAuth)만.
const sql = neon(process.env.DATABASE_URL);
const MODEL = process.env.GROUNDING_MODEL || "claude-haiku-4-5";
const MAX = Number(process.env.GROUNDING_MAX || 40);
const CONC = Number(process.env.GROUNDING_CONC || 1);   // 동시 처리 수(구독 세션 한도 내에서 처리량 배수)
const DRAIN_ALL = process.env.GROUNDING_DRAIN === "1";   // 1이면 잔여가 0될 때까지 배치 반복(끝까지)
const ID_MIN = Number(process.env.GROUNDING_ID_MIN || 0); // 이 id 초과만 처리(크레딧 Batches와 구간 분할 → 겹침 0)

const isLimit = (e) => /session limit|rate limit|429|usage limit|overloaded|exceeded/i.test(String(e?.message ?? e));
process.on("unhandledRejection", (e) => { console.log(isLimit(e) ? "구독 한도 — 오늘 종료, 내일 이어서." : "unhandled: " + String(e).slice(0, 100)); process.exit(0); });
process.on("uncaughtException", (e) => { console.log(isLimit(e) ? "구독 한도 — 종료." : "uncaught: " + String(e).slice(0, 100)); process.exit(0); });

async function check(name, identity, quotes, area) {
  const prompt = buildGroundingPrompt(name, identity, quotes, area);
  let text = "";
  for await (const msg of query({ prompt, options: { systemPrompt: GROUNDING_SYS, model: MODEL, maxTurns: 1, allowedTools: [] } })) {
    if (msg.type === "result" && msg.subtype === "success") text = msg.result;
  }
  return parseGrounding(text);
}

async function main() {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) { console.error("CLAUDE_CODE_OAUTH_TOKEN 필요(scripts/.judge.env)"); process.exit(0); }
  await sql`CREATE TABLE IF NOT EXISTS grounding_checks (cafe_id INT PRIMARY KEY, grounded BOOLEAN, issue TEXT, checked_at TIMESTAMPTZ DEFAULT now())`;
  // ONLY=suspects: 의심(grounded=false)만 재검사(자가치유 후 플래그 해소용). 기본: 교정된 의심 우선 → 미검사 → 오래된 순.
  // held(근거0건 보류) 카페도 재검사 대상에 포함 → 개선되면 grounded=true로 복귀 가능(데드락 방지).
  // ★ 순서 게이트: 'AI 판정 완료(llm_judged_at >= raw_collected_at)' 카페만 그라운딩. 판정이 후기 선별·재합성으로
  //   소개글을 바꾸므로, 판정 전 그라운딩은 무효가 됨. 판정 끝난 것만 검증 → 항상 올바른 순서, 헛검사 0.
  //   또 g.checked_at < synth_updated(합성 갱신 후) 또는 미검사만 → 변경 없으면 재검 안 함.
  const onlySuspects = process.env.GROUNDING_ONLY === "suspects";
  const fetchBatch = async () => onlySuspects
    ? await sql`
        SELECT c.id, c.name, c.area, c.dong, c.synth_identity, c.synth_reviews FROM cafes c
        JOIN grounding_checks g ON g.cafe_id = c.id
        WHERE (c.published OR c.pipeline_status = 'held') AND g.grounded = false AND c.synth_identity IS NOT NULL AND c.synth_reviews IS NOT NULL AND jsonb_array_length(c.synth_reviews) > 0
          AND c.llm_judged_at IS NOT NULL AND c.llm_judged_at >= c.raw_collected_at
        ORDER BY g.checked_at ASC LIMIT ${MAX}`
    : await sql`
        SELECT c.id, c.name, c.area, c.dong, c.synth_identity, c.synth_reviews FROM cafes c
        LEFT JOIN grounding_checks g ON g.cafe_id = c.id
        WHERE (c.published OR c.pipeline_status = 'held') AND c.synth_identity IS NOT NULL AND c.synth_reviews IS NOT NULL AND jsonb_array_length(c.synth_reviews) > 0
          AND c.llm_judged_at IS NOT NULL AND c.llm_judged_at >= c.raw_collected_at
          AND c.id > ${ID_MIN}
          AND (g.checked_at IS NULL OR g.checked_at < c.synth_updated)
        ORDER BY (g.grounded = false AND c.synth_updated > g.checked_at) DESC, g.checked_at ASC NULLS FIRST LIMIT ${MAX}`;

  let done = 0, flagged = 0, stop = false;
  // 한 카페 처리(동시 풀 워커가 호출)
  const processOne = async (c) => {
    const quotes = (c.synth_reviews || []).map((r) => r.quote).filter(Boolean).slice(0, 6);
    if (!quotes.length) return;
    let v;
    try { v = await check(c.name, c.synth_identity, quotes, [c.area, c.dong].filter(Boolean).join(" ")); }
    catch (e) { if (isLimit(e)) { stop = true; console.log(`구독 한도 — ${done}곳 완료, 다음에 이어서.`); return; } console.log(`✗ ${c.name}: ${String(e).slice(0, 60)}`); return; }
    if (!v) return;
    const grounded = v.grounded !== false;
    const issue = String(v.issue || "").slice(0, 200);
    await sql`INSERT INTO grounding_checks (cafe_id, grounded, issue, checked_at) VALUES (${c.id}, ${grounded}, ${issue}, now())
      ON CONFLICT (cafe_id) DO UPDATE SET grounded = ${grounded}, issue = ${issue}, checked_at = now()`;
    done++;
    if (done % 50 === 0) console.log(`  …진행 ${done}곳 (의심 ${flagged})`);
    if (!grounded) {
      flagged++; console.log(`⚠ ${c.name}: ${issue}`);
      // 되먹임: 업체혼동·환각 의심 카페는 판정 큐로 재투입 → 판정 AI가 본문 재심사(동명 다른 가게 제거)
      await sql`UPDATE cafes SET llm_judged_at = NULL WHERE id = ${c.id}`;
    }
  };
  // 배치 반복(DRAIN_ALL이면 잔여 0까지) × 배치 내부는 CONC개 동시 워커 풀
  do {
    const rows = await fetchBatch();
    if (rows.length === 0) { if (done === 0) console.log("그라운딩 대상 없음."); break; }
    let idx = 0;
    const worker = async () => { while (!stop) { const c = rows[idx++]; if (!c) break; await processOne(c); } };
    await Promise.all(Array.from({ length: Math.max(1, CONC) }, worker));
    if (stop) break;
    if (!DRAIN_ALL) break;               // 단일 배치 모드(기존 동작)
  } while (!stop);
  console.log(`\n그라운딩 검사 완료: ${done}곳 검사, ${flagged}곳 환각 의심(human review 필요).`);
}
main().catch((e) => { if (isLimit(e)) console.log("구독 한도 — 종료."); else console.error(e); process.exit(0); });
