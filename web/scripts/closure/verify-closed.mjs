#!/usr/bin/env node
// 🔍 폐업 매칭 **정확도 검증** — "공식 폐업인데 우리는 공개 중"인 카페가 진짜 닫혔는지 후기 활동으로 교차확인한다.
//   실행: node scripts/closure/verify-closed.mjs
//
// 🔴 왜: 매칭률(85.6%)은 '얼마나 이었나'일 뿐 '제대로 이었나'가 아니다. CEO 기준은 정확도 95%다.
//   독립 근거가 필요한데, 우리가 이미 가진 것 중 가장 강한 건 **후기 날짜**다.
//   공식 폐업일 이후에도 방문 후기가 계속 달리면 ①매칭이 틀렸거나 ②같은 자리에 다시 열었거나 둘 중 하나다.
// 💰 비용: review_dates(작은 캐시 컬럼)만 읽는다. raw_reviews·synth_reviews 안 건드림. 496행 1회.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
const DB = (env.match(/^DATABASE_URL=(.+)$/m) || [])[1].trim().replace(/^['"]|['"]$/g, "");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(DB);

const rep = JSON.parse(readFileSync(new URL("../../../agent-reports/permits/match-report.json", import.meta.url), "utf8"));
const list = rep.closedPublished ?? [];
const ids = list.map((r) => Number(r.id));
console.log(`검증 대상: 공식 폐업인데 공개 중 ${list.length}곳\n`);

const rows = await sql`SELECT id, name, review_dates, synth_grade, synth_count FROM cafes WHERE id = ANY(${ids})`;
const byId = new Map(rows.map((r) => [String(r.id), r]));

const lastDateOf = (rd) => {
  let v = rd; if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  const arr = Array.isArray(v) ? v : (v?.dates ?? []);
  // ⚠️ 실제 저장 형식은 점 구분("2025.03.07")이다 — 대시로 정규화해야 비교·정렬이 맞는다.
  const ds = arr.map((x) => String(x?.d ?? x ?? "").replace(/\./g, "-").replace(/-$/, ""))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  return ds.length ? ds[ds.length - 1] : null;
};

let after = 0, before = 0, unknown = 0, sim1 = 0;
const suspects = [];
for (const r of list) {
  const c = byId.get(String(r.id));
  const last = c ? lastDateOf(c.review_dates) : null;
  if (r.sim >= 1) sim1++;
  if (!last) { unknown++; continue; }
  // 폐업일 + 60일 이후에도 후기가 있으면 의심(등록 지연·후기 작성 지연 감안해 여유를 둔다)
  const cutoff = new Date(new Date(r.closed).getTime() + 60 * 86400000).toISOString().slice(0, 10);
  if (last > cutoff) { after++; suspects.push({ ...r, last, grade: c.synth_grade, n: c.synth_count }); }
  else before++;
}
const judged = after + before;
console.log("── 후기 활동 대조 ──");
console.log(`  폐업일 이후 60일 넘게 후기 없음(폐업과 일치) : ${before}곳`);
console.log(`  폐업일 한참 뒤에도 후기 있음(의심)          : ${after}곳`);
console.log(`  후기 날짜 없음(판정 불가)                   : ${unknown}곳`);
console.log(`\n  ▶ 판정 가능분 ${judged}곳 기준 정확도 ${judged ? (before / judged * 100).toFixed(1) : "-"}%  (CEO 기준 95%)`);
console.log(`  ▶ 이름 완전일치(유사도 1.0) 비율: ${(sim1 / list.length * 100).toFixed(1)}%`);

if (suspects.length) {
  console.log(`\n── 의심 상위 12건(폐업 뒤에도 후기가 이어짐) ──`);
  for (const s of suspects.sort((a, b) => (b.last > a.last ? 1 : -1)).slice(0, 12))
    console.log(`  #${s.id} ${String(s.name).padEnd(16)} 폐업 ${s.closed} · 최근후기 ${s.last} · 유사도 ${s.sim} · 후보 ${s.cands} · ${s.grade}(${s.n})`);
}
console.log("\nDB 반영 없음 — 자동 비공개는 금지되어 있다(CEO 규칙).");
