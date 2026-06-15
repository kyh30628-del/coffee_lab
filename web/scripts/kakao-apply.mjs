// 카카오맵 MCP 검증 결과 적용 — /tmp/kakao-results/agent-*.json 의 [{id, category}]를 읽어
//  표준 게이트(isNonCafe/isFranchise)로 판정: 카페면 공개 복원, 프랜차이즈·비카페면 차단. needs_category 해제.
import { readFileSync, readdirSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { isFranchise, isNonCafe } = await import("../lib/discover.ts");
const { sql } = await import("../lib/db.ts");

const dir = "/tmp/kakao-results";
const results = [];
for (const f of readdirSync(dir)) {
  if (!/^agent-.*\.json$/.test(f)) continue;
  try { const arr = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); if (Array.isArray(arr)) results.push(...arr); } catch {}
}
// id 중복 제거(마지막 우선)
const byId = new Map();
for (const r of results) if (r && r.id) byId.set(Number(r.id), r);

let restored = 0, blocked = 0, nocat = 0;
const restoredNames = [], blockedNames = [];
for (const [id, r] of byId) {
  const cat = (r.category || "").trim();
  // 보류분 또는 (이전 배치에서 차단됐던) rejected 보류출신만 재평가 — 정상 공개 카페는 건드리지 않음
  const row = (await sql`SELECT name, synth_grade FROM cafes WHERE id=${id} AND (needs_category=true OR (NOT published AND pipeline_status='rejected'))`)[0];
  if (!row) continue;
  const name = row.name;
  if (!cat) { nocat++; continue; } // 카테고리 못 얻음 → 보류 유지(자정 백필이 재시도)
  if (cat) await sql`UPDATE cafes SET naver_category=${cat} WHERE id=${id}`;
  const bad = isFranchise(name) || isNonCafe(name, cat);
  if (bad) {
    await sql`UPDATE cafes SET published=false, needs_category=false, pipeline_status='rejected' WHERE id=${id}`;
    blocked++; if (blockedNames.length < 20) blockedNames.push(`${name} [${cat}]`);
  } else {
    await sql`UPDATE cafes SET needs_category=false, published=(synth_grade IN ('검증','참고') AND lat BETWEEN 36.8 AND 38.3 AND lng BETWEEN 124.5 AND 127.9), pipeline_status=CASE WHEN synth_grade IN ('검증','참고') THEN 'live' ELSE pipeline_status END WHERE id=${id}`;
    restored++; if (restoredNames.length < 20) restoredNames.push(`${name} [${cat}]`);
  }
}
console.log(`적용 ${byId.size}곳 → 복원 ${restored} · 차단 ${blocked} · 카테고리못얻음(보류유지) ${nocat}`);
console.log("복원 샘플:"); restoredNames.forEach((n) => console.log("  ✓ " + n));
console.log("차단 샘플:"); blockedNames.forEach((n) => console.log("  ⛔ " + n));
const t = (await sql`SELECT count(*) FILTER(WHERE published)::int pub, count(*) FILTER(WHERE needs_category)::int held FROM cafes`)[0];
console.log(`\n→ 공개 ${t.pub}곳 · 보류 남음 ${t.held}곳`);
process.exit(0);
