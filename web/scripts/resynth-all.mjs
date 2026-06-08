// 전수 재합성 — 캐시된 raw로 모든 카페 재합성(API 0). 새 링크-dedup 등 로직 반영.
// Sonnet 판정됐던 카페는 dedup 후 재판정 필요 → llm_judged_at 초기화(다음 배치가 재심사).
// 실행: node --import tsx scripts/resynth-all.mjs
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
delete process.env.ANTHROPIC_API_KEY; // 인라인 LLM 호출 방지(규칙 기반 빠른 재합성)

const { synthAndStore } = await import("../lib/synthStore.ts");
const { sql } = await import("../lib/db.ts");

const rows = await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NOT NULL ORDER BY id`;
console.log(`전수 재합성 시작: ${rows.length}곳 (링크 중복 제거 적용)`);
let done = 0, fail = 0, dropped = 0;
for (const c of rows) {
  try {
    const before = (await sql`SELECT synth_count FROM cafes WHERE id=${c.id}`)[0]?.synth_count ?? 0;
    const r = await synthAndStore(c, { refresh: false });
    if (r?.collected != null && r.collected < before) dropped++;
    done++;
    if (done % 200 === 0) console.log(`  …${done}/${rows.length} (중복제거로 수치 감소 ${dropped}곳)`);
  } catch (e) { fail++; if (fail <= 5) console.log(`  ✗ ${c.name}: ${String(e).slice(0, 70)}`); }
}
// Sonnet 판정됐던 카페 → 재판정 큐로 복귀
const cleared = await sql`UPDATE cafes SET llm_judged_at=NULL WHERE llm_judged_at IS NOT NULL AND raw_reviews IS NOT NULL`;
console.log(`\n완료: ${done} 재합성, ${fail} 실패. 중복으로 수치 줄어든 카페 ${dropped}곳.`);
console.log(`Sonnet 재판정 큐 복귀(llm_judged_at 초기화): 다음 04:00 배치가 dedup 반영해 재심사.`);
process.exit(0);
