// 🧠 LLM 그라운딩 검사(레드팀 보조 레이어) — Claude Max 구독으로 로컬 실행.
// 시스템이 생성한 카페 '한줄 정체성'이 실제 근거 후기로 뒷받침되는지(=환각 없는지) 검사.
// 결정론적 불변식(cron-verify)이 1차 backbone, 이건 생성문 환각을 잡는 2차 보조 신호.
// 의심분은 자동 조치하지 않고 관리자 'human review'로 표시(LLM도 틀릴 수 있으므로).
// 실행: node scripts/verify-grounding.mjs  (CLAUDE_CODE_OAUTH_TOKEN 필요, ANTHROPIC_API_KEY unset)
import { query } from "@anthropic-ai/claude-agent-sdk";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const MODEL = process.env.GROUNDING_MODEL || "claude-haiku-4-5";
const MAX = Number(process.env.GROUNDING_MAX || 40);

const isLimit = (e) => /session limit|rate limit|429|usage limit|overloaded|exceeded/i.test(String(e?.message ?? e));
process.on("unhandledRejection", (e) => { console.log(isLimit(e) ? "구독 한도 — 오늘 종료, 내일 이어서." : "unhandled: " + String(e).slice(0, 100)); process.exit(0); });
process.on("uncaughtException", (e) => { console.log(isLimit(e) ? "구독 한도 — 종료." : "uncaught: " + String(e).slice(0, 100)); process.exit(0); });

const SYS = `너는 '업체 혼동'과 '환각'만 잡는 감사관이다. 그 두 가지 외에는 절대 문제삼지 않는다.
절대 문제삼지 말 것: 맛·성격 특성(산미·바디·단맛·로스팅 등) 강조, 언급 '횟수' 차이, 표현·뉘앙스 차이 — 이것들은 전체 후기 집계라 일부 인용에 없어도 정상이다(전부 grounded=true).
오직 다음 두 가지만 grounded=false:
1) 업체 혼동: 근거 후기의 상당수(여러 건)가 이 카페가 아니라 '다른 가게'(동명 다른 업체·다른 업종·다른 메뉴의 가게)를 가리킨다.
2) 환각: 후기에 전혀 근거 없는 구체적 사실(없는 수상·없는 메뉴·지어낸 역사 등)을 만들어냈다.
확신이 없으면 grounded=true. 반드시 JSON으로만: {"grounded":true/false,"issue":"업체혼동/환각만 한 줄, 없으면 빈 문자열"}`;

async function check(name, identity, quotes) {
  const list = quotes.map((q, i) => `${i + 1}. ${q}`).join("\n");
  const prompt = `카페: "${name}"\n생성된 정체성: "${identity}"\n\n근거 후기:\n${list}`;
  let text = "";
  for await (const msg of query({ prompt, options: { systemPrompt: SYS, model: MODEL, maxTurns: 1, allowedTools: [] } })) {
    if (msg.type === "result" && msg.subtype === "success") text = msg.result;
  }
  try { const m = text.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : text); } catch { return null; }
}

async function main() {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) { console.error("CLAUDE_CODE_OAUTH_TOKEN 필요(scripts/.judge.env)"); process.exit(0); }
  await sql`CREATE TABLE IF NOT EXISTS grounding_checks (cafe_id INT PRIMARY KEY, grounded BOOLEAN, issue TEXT, checked_at TIMESTAMPTZ DEFAULT now())`;
  // 가장 오래 검사 안 된 공개 카페부터(정체성·근거 보유) — 로테이션으로 전체를 점진 커버·갱신
  const rows = await sql`
    SELECT c.id, c.name, c.synth_identity, c.synth_reviews FROM cafes c
    LEFT JOIN grounding_checks g ON g.cafe_id = c.id
    WHERE c.published AND c.synth_identity IS NOT NULL AND c.synth_reviews IS NOT NULL AND jsonb_array_length(c.synth_reviews) > 0
    ORDER BY g.checked_at ASC NULLS FIRST LIMIT ${MAX}`;
  let done = 0, flagged = 0;
  for (const c of rows) {
    const quotes = (c.synth_reviews || []).map((r) => r.quote).filter(Boolean).slice(0, 6);
    if (!quotes.length) continue;
    let v;
    try { v = await check(c.name, c.synth_identity, quotes); }
    catch (e) { if (isLimit(e)) { console.log(`구독 한도 — ${done}곳 완료, 내일 이어서.`); break; } console.log(`✗ ${c.name}: ${String(e).slice(0, 60)}`); continue; }
    if (!v) continue;
    const grounded = v.grounded !== false;
    const issue = String(v.issue || "").slice(0, 200);
    await sql`INSERT INTO grounding_checks (cafe_id, grounded, issue, checked_at) VALUES (${c.id}, ${grounded}, ${issue}, now())
      ON CONFLICT (cafe_id) DO UPDATE SET grounded = ${grounded}, issue = ${issue}, checked_at = now()`;
    done++; if (!grounded) { flagged++; console.log(`⚠ ${c.name}: ${issue}`); }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`\n그라운딩 검사 완료: ${done}곳 검사, ${flagged}곳 환각 의심(human review 필요).`);
}
main().catch((e) => { if (isLimit(e)) console.log("구독 한도 — 종료."); else console.error(e); process.exit(0); });
