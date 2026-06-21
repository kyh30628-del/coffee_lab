import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_AI_KEY; delete process.env.GOOGLE_API_KEY; delete process.env.GOOGLE_API_KEY_1;
const { synthAndStore } = await import("../lib/synthStore.ts");
const { sql } = await import("../lib/db.ts");
const pubBefore = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published`)[0].n;
const rows = await sql`SELECT id, name, area, published, synth_grade FROM cafes WHERE raw_reviews IS NOT NULL ORDER BY id`;
console.log(`[start] 재합성 대상 ${rows.length}곳 · 현재 공개 ${pubBefore}`);
let done = 0, fail = 0, unpub = 0, nowPub = 0;
const unpubNames = [];
for (const c of rows) {
  try {
    const r = await synthAndStore({ id: c.id, name: c.name, area: c.area }, { refresh: false });
    if (c.published && r.published === false) { unpub++; if (unpubNames.length < 50) unpubNames.push(`${c.name}(${c.synth_grade}→${r.grade})`); }
    if (!c.published && r.published === true) nowPub++;
    done++;
    if (done % 250 === 0) console.log(`  …${done}/${rows.length} · 비공개전환 ${unpub} · 공개전환 ${nowPub} · 실패 ${fail}`);
  } catch (e) { fail++; if (fail <= 8) console.log(`  x ${c.name}: ${String(e).slice(0,70)}`); }
}
const pubAfter = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published`)[0].n;
console.log(`\n[done] 재합성 ${done} · 실패 ${fail}`);
console.log(`공개: ${pubBefore} -> ${pubAfter} (비공개전환 ${unpub}, 공개전환 ${nowPub})`);
console.log(`비공개 전환 샘플:\n  ${unpubNames.join("\n  ")}`);
process.exit(0);
