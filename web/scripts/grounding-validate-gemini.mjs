// 그라운딩 모델 교체 검증 — Haiku가 그라운딩한 카페를 같은 프롬프트로 Gemini 2.5 Flash가 재검증 → 일치율.
//  핵심: Haiku가 잡은 '의심(grounded=false)'을 Gemini도 잡는가(환각·혼동 놓치면 위험). 읽기 전용.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const KEY = process.env.GOOGLE_AI_KEY || process.env.GOOGLE_API_KEY_1 || process.env.GOOGLE_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const SYS = `너는 '업체 혼동'과 '환각'만 잡는 감사관이다. 그 두 가지 외에는 절대 문제삼지 않는다.
절대 문제삼지 말 것: 맛·성격 특성(산미·바디·단맛·로스팅 등) 강조, 언급 '횟수' 차이, 표현·뉘앙스 차이 — 이것들은 전체 후기 집계라 일부 인용에 없어도 정상이다(전부 grounded=true).
오직 다음 두 가지만 grounded=false:
1) 업체 혼동: 근거 후기의 상당수(여러 건)가 이 카페가 아니라 '다른 가게'(동명 다른 업체·다른 업종·다른 메뉴의 가게)를 가리킨다.
2) 환각: 후기에 전혀 근거 없는 구체적 사실(없는 수상·없는 메뉴·지어낸 역사 등)을 만들어냈다.
확신이 없으면 grounded=true. 반드시 JSON으로만: {"grounded":true/false,"issue":"업체혼동/환각만 한 줄, 없으면 빈 문자열"}`;

async function gemini(name, identity, quotes) {
  const list = quotes.map((q, i) => `${i + 1}. ${q}`).join("\n");
  const prompt = `카페: "${name}"\n생성된 정체성: "${identity}"\n\n근거 후기:\n${list}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  // thinking 켬(-1=동적, 모델이 필요한 만큼 추론). 출력 한도는 thinking+답변 위해 넉넉히.
  const body = JSON.stringify({ systemInstruction: { parts: [{ text: SYS }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: -1 } } });
  for (let a = 0; a < 3; a++) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 1500 * (a + 1))); continue; }
    if (!r.ok) return null;
    const d = await r.json();
    const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    try { const m = text.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : text); } catch { return null; }
  }
  return null;
}

// Haiku 의심 전량 + grounded=true 표본
const suspects = await sql`SELECT c.id, c.name, c.synth_identity, c.synth_reviews, g.grounded h FROM cafes c JOIN grounding_checks g ON g.cafe_id=c.id WHERE g.grounded=false AND c.synth_identity IS NOT NULL AND c.synth_reviews IS NOT NULL ORDER BY g.checked_at DESC LIMIT ${Number(process.env.SUSPECT_N || 120)}`;
const oks = await sql`SELECT c.id, c.name, c.synth_identity, c.synth_reviews, g.grounded h FROM cafes c JOIN grounding_checks g ON g.cafe_id=c.id WHERE g.grounded=true AND c.synth_identity IS NOT NULL AND c.synth_reviews IS NOT NULL ORDER BY g.checked_at DESC LIMIT ${Number(process.env.OK_N || 40)}`;
const rows = [...suspects, ...oks];

let agree = 0, cmp = 0, missSuspect = 0, caughtSuspect = 0, overFlag = 0, err = 0;
const missed = [];
for (const c of rows) {
  const quotes = (c.synth_reviews || []).map((r) => r.quote).filter(Boolean).slice(0, 6);
  if (!quotes.length) continue;
  const v = await gemini(c.name, c.synth_identity, quotes);
  if (!v || typeof v.grounded !== "boolean") { err++; continue; }
  const h = !!c.h, g = !!v.grounded;
  cmp++;
  if (h === g) agree++;
  if (!h && g) { missSuspect++; if (missed.length < 12) missed.push(`${c.name}: Haiku 의심 → Gemini 정상통과 | "${(c.synth_identity || "").slice(0, 40)}"`); }
  if (!h && !g) caughtSuspect++;
  if (h && !g) overFlag++;
  await new Promise((r) => setTimeout(r, 80));
}
const nSus = suspects.length;
console.log(`\n===== 그라운딩 일치율 검증 (Gemini ${MODEL} vs Haiku) =====`);
console.log(`비교 ${cmp}건 (의심 ${nSus} + 정상표본 ${oks.length}) · API오류 ${err}`);
console.log(`전체 일치: ${agree}/${cmp} = ${cmp ? (agree / cmp * 100).toFixed(1) : 0}%`);
console.log(`\n★ 의심(환각·혼동) 포착력 — 가장 중요:`);
console.log(`  Haiku가 잡은 의심을 Gemini도 잡음: ${caughtSuspect}/${caughtSuspect + missSuspect} = ${(caughtSuspect + missSuspect) ? (caughtSuspect / (caughtSuspect + missSuspect) * 100).toFixed(1) : 0}%`);
console.log(`  ⚠ Gemini가 놓친 의심(환각 통과 위험): ${missSuspect}건`);
console.log(`  Gemini가 추가로 의심 플래그(Haiku는 정상): ${overFlag}건 (안전 방향 — human review 늘 뿐)`);
console.log(`\n놓친 의심 샘플:`); missed.forEach((m) => console.log("  · " + m));
console.log(`\n판단: 의심 포착력 높고 '놓친 의심' 적으면 교체 가능(그라운딩은 보조 안전망 + Claude 한도와 분리됨).`);
process.exit(0);
