// 카테고리 오분류로 잘못 차단(rejected)된 진짜 카페 복원 — 갱신된 isNonCafe/isFranchise로 재평가.
//  카테고리 있는 것만 대상(검증 불가한 무카테고리는 그대로 보류). 프랜차이즈·비카페는 계속 차단.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { isFranchise, isNonCafe } = await import("../lib/discover.ts");
const { sql } = await import("../lib/db.ts");

const rows = await sql`SELECT id, name, naver_category, synth_grade FROM cafes
  WHERE NOT published AND pipeline_status='rejected' AND synth_grade IN ('검증','참고')
    AND naver_category IS NOT NULL AND naver_category <> ''
    AND lat BETWEEN 36.8 AND 38.7 AND lng BETWEEN 124.5 AND 129.4`;

let restored = 0, kept = 0;
const restoredNames = [];
for (const c of rows) {
  const cafe = !isFranchise(c.name) && !isNonCafe(c.name, c.naver_category);
  if (cafe) {
    await sql`UPDATE cafes SET published = true, pipeline_status = 'live', needs_category = false WHERE id = ${c.id}`;
    restored++; if (restoredNames.length < 40) restoredNames.push(`${c.name} [${c.naver_category}]`);
  } else kept++;
}
console.log(`재평가 ${rows.length}곳 → 복원 ${restored} · 계속 차단 ${kept}`);
console.log("복원된 카페:"); restoredNames.forEach((n) => console.log("  ✓ " + n));
const pub = (await sql`SELECT count(*)::int n FROM cafes WHERE published`)[0].n;
console.log(`\n→ 현재 공개: ${pub}곳`);
process.exit(0);
