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
console.log(`\n완료: ${done} 재합성, ${fail} 실패. 중복으로 수치 줄어든 카페 ${dropped}곳.`);
// 판정 결정은 영구 저장(judge_decisions)돼 재합성에 자동 반영되므로, 기본은 llm_judged_at을 '지우지 않는다'.
// → 판정은 raw가 새로 바뀐 카페(llm_judged_at < raw_collected_at)만 효율적으로 재처리.
// 루브릭을 바꿔 '전체 재판정'이 필요할 때만 REJUDGE=1로 명시 초기화.
if (process.env.REJUDGE === "1") {
  await sql`UPDATE cafes SET llm_judged_at=NULL WHERE llm_judged_at IS NOT NULL AND raw_reviews IS NOT NULL`;
  console.log(`REJUDGE=1 → 전체 판정 큐 초기화(루브릭 변경 반영용).`);
} else {
  console.log(`판정 큐 유지(영구 결정 자동반영) — 변경된 카페만 다음 배치가 재판정.`);
}
process.exit(0);
