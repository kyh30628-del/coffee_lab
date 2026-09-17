// 🔁 미공개 카페 재판정 — **기준(criteria)을 바꾼 뒤 소급 적용**하는 상비 도구.
//
//   왜 필요한가(2026-09-18 실측): 재판정 레인이 전부 `published=true`만 본다.
//     cron-resynth genRows → `WHERE published = true`
//     held 레인 → `pipeline_status='held'`만
//     즉 **rejected·new 상태의 미공개 카페는 어느 레인에도 안 걸린다.**
//   그래서 CEO가 grade.floor.reference_new를 5→3으로 내려도(09-17) 이미 rejected된 1,161곳은
//   영영 자격을 못 얻는다. synth_updated=NULL로 큐에 넣어봐야 소용없다(그 큐도 published=true만 본다).
//
//   🔒 안전장치
//     ① 기본은 **미리보기**. 실제 실행은 --apply.
//     ② published를 직접 안 건드린다 — synthAndStore가 전 게이트를 다시 통과시킨다.
//        (문턱뿐 아니라 비카페·프랜차이즈·좌표·신선도까지 현행 규칙으로 재판정)
//     ③ refresh:false — 네이버 쿼터 0. 기존 원본으로 규칙만 재적용한다.
//     ④ --limit 로 상한. 기본 500.
//
//   실행: node --import tsx scripts/resynth-unpublished.mjs [--apply] [--limit N] [--conc N]
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { synthAndStore } = await import("../lib/synthStore.ts");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const APPLY = process.argv.includes("--apply");
const LIMIT = arg("--limit", 500), CONC = arg("--conc", 4);

// 대상: 미공개 + 원본 보유 + 영구제외 아님. 오래 방치된 것부터.
const rows = await sql`SELECT id, name, area, synth_grade, synth_count, pipeline_status FROM cafes
  WHERE NOT published AND raw_reviews IS NOT NULL
    AND pipeline_status NOT IN ('excluded','noise')
  ORDER BY synth_checked_at ASC NULLS FIRST LIMIT ${LIMIT}`;
const byStatus = rows.reduce((m, r) => { m[r.pipeline_status ?? "(없음)"] = (m[r.pipeline_status ?? "(없음)"] ?? 0) + 1; return m; }, {});
console.log(`대상 ${rows.length.toLocaleString()}곳 (상한 ${LIMIT}) · 상태: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(" · ")}`);
console.log(`네이버 쿼터 0(refresh:false) · 동시 ${CONC} · 예상 ${Math.ceil(rows.length * 3.5 / CONC / 60)}분`);
if (!APPLY) { console.log("\n▶ 미리보기다. 실제로 돌리려면 --apply 를 붙여라."); process.exit(0); }

let i = 0, ok = 0, err = 0;
const t0 = Date.now();
const worker = async () => {
  while (true) {
    const c = rows[i++]; if (!c) break;
    try { await synthAndStore({ id: c.id, name: c.name, area: c.area ?? "" }, { refresh: false }); ok++; }
    catch (e) { err++; if (err <= 3) console.log(`  오류 ${c.name}: ${String(e).slice(0, 70)}`); }
    if (ok % 100 === 0 && ok) console.log(`  … ${ok}곳 (${Math.round((Date.now() - t0) / 1000)}초)`);
  }
};
await Promise.all(Array.from({ length: CONC }, worker));
const after = await sql`SELECT pipeline_status, count(*)::int n, count(*) FILTER (WHERE published)::int pub
  FROM cafes WHERE id = ANY(${rows.map((r) => r.id)}) GROUP BY 1 ORDER BY 2 DESC`;
console.log(`\n완료 ${ok}곳 · 오류 ${err} · ${Math.round((Date.now() - t0) / 1000)}초`);
console.log("결과:", after.map((x) => `${x.pipeline_status}=${x.n}(공개 ${x.pub})`).join(" · "));
console.log("→ pending은 cron-embed(08:01·12:01·16:01·20:03)의 finalizePipeline이 임베딩 후 승격한다.");
