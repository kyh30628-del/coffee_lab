#!/usr/bin/env node
// 🎯 위험 공개 카페 우선 재판정(2026-09-24 CEO 지시 "권하는 순서대로 다 진행").
//
//   왜: 검증 엔진 규칙을 크게 바꿨지만(업체글·목록·타지역·동·합성상호) cron-resynth는 회당 300곳이라
//   공개 38,543곳 전체에 반영되는 데 약 한 달이 걸린다. 그동안 '강남 씨엘드프랑스에 대전 후기 6건' 같은
//   오염이 계속 노출된다. 오염 비중이 큰 **얇은 카페(검증 ≤4건)와 주제 글 0건 카페**부터 먼저 돌린다.
//
//   🔒 안전장치
//     ① 기본 미리보기 · 실행은 --apply
//     ② refresh:false — 네이버 쿼터 0(저장된 원본에 현행 규칙만 재적용)
//     ③ 대량 비공개 차단기 — 100곳 이후 비공개율 20% 초과 시 즉시 중단(cron-resynth와 같은 기준)
//     ④ 처리한 카페에 rules_fp 기록 → cron-resynth가 같은 카페를 다시 읽지 않는다(비용 앞당기기일 뿐 증가 없음)
//     ⑤ 23시 데드라인(새벽 DB 깨우기 금지) · 리스(heal 레인과 충돌 방지)
//     ⑥ 공개 상태가 바뀌었거나 노출 인용(상위 3)이 바뀐 카페만 /c·지도 캐시 무효화(50곳 단위)
//
//   실행: node --import tsx scripts/resynth-published-risk.mjs [--apply] [--limit N] [--conc N]
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { synthAndStore } = await import("../lib/synthStore.ts");
const { rulesFingerprint } = await import("../lib/rulesFingerprint.ts");
const { acquireLease, releaseLease } = await import("../lib/healLease.ts");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const APPLY = process.argv.includes("--apply");
const LIMIT = arg("--limit", 7000), CONC = arg("--conc", 4), STOP_H = arg("--stop-hour", 23);
const pastDeadline = () => new Date(Date.now() + 9 * 3600e3).getUTCHours() >= STOP_H;

const fp = await rulesFingerprint();
const top3 = (r) => [0, 1, 2].map((i) => r?.[`l${i}`] ?? "").join("|");
const rows = await sql`SELECT id, name, area, synth_count, published,
    synth_reviews->0->>'link' l0, synth_reviews->1->>'link' l1, synth_reviews->2->>'link' l2
  FROM cafes WHERE published AND raw_reviews IS NOT NULL
    AND (synth_count <= 4 OR COALESCE((synth_quality->>'verified')::int, 0) = 0)
    AND rules_fp IS DISTINCT FROM ${fp}
  ORDER BY synth_count ASC, id ASC LIMIT ${LIMIT}`;
console.log(`대상 ${rows.length.toLocaleString()}곳(검증 ≤4건 또는 주제 글 0건, 현행 지문 미적용) · 쿼터 0 · 동시 ${CONC} · 지문 ${fp.slice(0, 8)}`);
if (!APPLY) { console.log("▶ 미리보기. --apply 로 실행."); process.exit(0); }

let i = 0, done = 0, err = 0, stop = "";
const unpub = [], dispChanged = [], countDrop = [];
const t0 = Date.now();
const worker = async () => {
  while (!stop) {
    const c = rows[i++]; if (!c) break;
    if (pastDeadline()) { stop = `${STOP_H}시 데드라인`; break; }
    if (!(await acquireLease("resynth-risk", Number(c.id), 120))) continue;
    try {
      await synthAndStore({ id: c.id, name: c.name, area: c.area ?? "" }, { refresh: false });
      const [a] = await sql`SELECT synth_count, published, synth_reviews->0->>'link' l0, synth_reviews->1->>'link' l1, synth_reviews->2->>'link' l2 FROM cafes WHERE id=${c.id}`;
      await sql`UPDATE cafes SET rules_fp = ${fp} WHERE id = ${c.id}`;
      done++;
      if (!a.published) unpub.push({ id: Number(c.id), name: c.name, before: c.synth_count, after: a.synth_count });
      else if (top3(a) !== top3(c)) dispChanged.push(Number(c.id));
      if (Number(a.synth_count) < Number(c.synth_count)) countDrop.push(Number(c.id));
      if (done >= 100 && unpub.length / done > 0.2) stop = `차단기(비공개율 ${(100 * unpub.length / done).toFixed(1)}% > 20%)`;
      if (done % 500 === 0) console.log(`  … ${done}곳 · 비공개 ${unpub.length} · 인용 변경 ${dispChanged.length} · ${Math.round((Date.now() - t0) / 1000)}초`);
    } catch (e) { err++; if (err <= 3) console.log(`  오류 #${c.id}: ${String(e).slice(0, 80)}`); }
    finally { await releaseLease("resynth-risk", Number(c.id)).catch(() => {}); }
  }
};
await Promise.all(Array.from({ length: CONC }, worker));

// 캐시 무효화 — 상태 변경·노출 인용 변경분만(CLAUDE.md 규칙 5)
const inval = [...unpub.map((u) => u.id), ...dispChanged];
if (unpub.length) await sql`DELETE FROM search_cache WHERE qkey <> '__geo_index_v1__'`.catch(() => {});
let invalOk = 0;
for (let k = 0; k < inval.length; k += 50) {
  const r = await fetch("https://dongnecoffeenote.com/api/admin/revalidate", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": process.env.ADMIN_PASSWORD ?? "" }, body: JSON.stringify({ ids: inval.slice(k, k + 50) }) }).then((x) => x.json()).catch(() => ({}));
  invalOk += Number(r?.revalidated ?? 0);
}
const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
const out = `${process.env.HOME}/coffee-platform/agent-reports/resynth-risk-${day}.json`;
writeFileSync(out, JSON.stringify({ done, err, stop, unpub, dispChanged: dispChanged.length, countDrop: countDrop.length, invalidated: invalOk }, null, 1));
console.log(`\n완료 ${done}곳 · 오류 ${err} · ${Math.round((Date.now() - t0) / 1000)}초${stop ? ` · ⏹ ${stop}` : ""}`);
console.log(`비공개 전환 ${unpub.length}곳 · 노출 인용 변경 ${dispChanged.length}곳 · 검증 수 감소 ${countDrop.length}곳 · 캐시 무효화 ${invalOk}곳 → ${out}`);
process.exit(0);
