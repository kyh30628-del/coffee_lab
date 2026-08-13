// 🐶🥐🌄 신설 3축(pet/brunch/view) 1회성 소급 — 2026-08-13 P1(CEO 승인).
//   비용 규율: 리뷰는 quote만 SQL에서 잘라 전송(통째 금지). 갱신은 char_scores 병합(작은 JSONB).
//   재실행 안전(멱등) — 같은 입력이면 같은 결과를 덮어쓸 뿐.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { computeCharScores } = await import("../lib/charScore.ts");
const sql = neon(process.env.DATABASE_URL);
const NEW_AXES = ["pet", "brunch", "view"];
const rows = await sql`
  SELECT id, name, jsonb_path_query_array(synth_reviews, '$[*].quote') quotes
  FROM cafes WHERE published AND synth_reviews IS NOT NULL`;
console.log(`대상 ${rows.length}곳`);
let updated = 0, flagged = { pet: 0, brunch: 0, view: 0 };
const CONC = 8;
let i = 0;
async function worker() {
  while (i < rows.length) {
    const c = rows[i++];
    const quotes = (Array.isArray(c.quotes) ? c.quotes : []).map((q) => String(q || ""));
    if (!quotes.length) continue;
    const all = computeCharScores(quotes, c.name);
    const patch = {};
    for (const k of NEW_AXES) if ((all[k] ?? 0) > 0) { patch[k] = all[k]; flagged[k]++; }
    if (Object.keys(patch).length === 0) continue;
    await sql`UPDATE cafes SET char_scores = COALESCE(char_scores,'{}'::jsonb) || ${JSON.stringify(patch)}::jsonb WHERE id=${c.id}`;
    updated++;
    if (updated % 500 === 0) console.log(`  …${updated} 갱신`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`완료: 갱신 ${updated}곳 · pet ${flagged.pet} · brunch ${flagged.brunch} · view ${flagged.view}`);
process.exit(0);
