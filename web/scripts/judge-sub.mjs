// 구독(OAuth) 판정 러너 — 직접 DB, 동시처리(CONC), 잔여0까지(DRAIN), 한도시 멈춤(다음에 재개).
//   경계 리뷰 0인 카페는 LLM 없이 markJudged(무과금). 경계 있는 카페만 query()로 판정.
//   verify-grounding.mjs와 같은 구조. 실행: GROUNDING_CONC 대신 JUDGE_CONC, JUDGE_DRAIN=1.
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, existsSync } from "node:fs";
import { JUDGE_RUBRIC, buildJudgePrompt, parseJudgeVerdicts } from "./_judge-rubric.mjs";

if (existsSync(new URL("./.ai-paused", import.meta.url))) { console.log("⏸ .ai-paused"); process.exit(0); }
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
delete process.env.ANTHROPIC_API_KEY; // 구독 전용 — API키 있으면 종량제로 샘(과금)
const { sql } = await import("../lib/db.ts");
const { getAuditCandidates, applyDecisions, markJudged } = await import("../lib/synthStore.ts");
const MODEL = process.env.JUDGE_MODEL || "claude-haiku-4-5";
const CONC = Number(process.env.JUDGE_CONC || 6);
const MAX = Number(process.env.JUDGE_MAX || 400);
const DRAIN = process.env.JUDGE_DRAIN === "1";
const INCLUDE_HELD = process.env.JUDGE_HELD === "1"; // 보류 카페도 재판정 대상에 포함

const isLimit = (e) => /session limit|rate limit|429|usage limit|overloaded|exceeded/i.test(String(e?.message ?? e));
process.on("unhandledRejection", (e) => { console.log(isLimit(e) ? "구독 한도 — 다음에 이어서." : "unhandled:" + String(e).slice(0,80)); process.exit(0); });

async function judge(name, area, items) {
  let text = "";
  for await (const msg of query({ prompt: buildJudgePrompt(name, area, items.map((b, i) => ({ i, title: b.title, body: b.body }))), options: { systemPrompt: JUDGE_RUBRIC, model: MODEL, maxTurns: 1, allowedTools: [] } }))
    if (msg.type === "result" && msg.subtype === "success") text = msg.result;
  return parseJudgeVerdicts(text);
}
const fetchBatch = () => INCLUDE_HELD
  ? sql`SELECT id, name, area FROM cafes
      WHERE raw_reviews IS NOT NULL AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at)
        AND (published OR pipeline_status='pending' OR pipeline_status='held')
      ORDER BY published DESC, id LIMIT ${MAX}`
  : sql`SELECT id, name, area FROM cafes
      WHERE raw_reviews IS NOT NULL AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at)
        AND (published OR pipeline_status='pending')
      ORDER BY published DESC, id LIMIT ${MAX}`;

let done = 0, llm = 0, freeMarked = 0, pub = 0, stop = false;
const processOne = async (c) => {
  const { candidates, hasRaw } = await getAuditCandidates({ id: c.id, name: c.name, area: c.area ?? "" });
  if (!hasRaw) { await markJudged(c.id); return; }
  if (candidates.length === 0) { await markJudged(c.id); freeMarked++; done++; return; } // 경계0 → 무과금
  let verdicts;
  try { verdicts = await judge(c.name, c.area ?? "", candidates.slice(0, 35)); }
  catch (e) { if (isLimit(e)) { stop = true; console.log(`구독 한도 — ${done}곳 완료, 다음에 이어서.`); return; } console.log(`✗ ${c.name}: ${String(e).slice(0,50)}`); return; }
  if (!Array.isArray(verdicts)) return;
  const decisions = {};
  for (const v of verdicts) { const k = candidates[v?.i]?.key; if (k) decisions[k] = !!(v.about && v.helpful); }
  try { const r = await applyDecisions({ id: c.id, name: c.name, area: c.area ?? "" }, decisions); llm++; done++; if (r?.published) pub++; }
  catch (e) { console.log(`✗ apply ${c.name}: ${String(e.message||e).slice(0,50)}`); }
  if (done % 50 === 0) console.log(`  …판정 ${done} (LLM ${llm}·무과금 ${freeMarked}·공개 ${pub})`);
};
do {
  const rows = await fetchBatch();
  if (!rows.length) break;
  let idx = 0;
  const worker = async () => { while (!stop) { const c = rows[idx++]; if (!c) break; await processOne(c); } };
  await Promise.all(Array.from({ length: Math.max(1, CONC) }, worker));
  if (stop || !DRAIN) break;
} while (!stop);
console.log(`\n판정 완료: ${done}곳 (LLM ${llm}·무과금 ${freeMarked}·신규공개 ${pub})`);
process.exit(0);
