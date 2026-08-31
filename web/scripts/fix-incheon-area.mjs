// 🧭 인천 area 오분류 교정 — 주소를 진실원본으로 삼아 DB의 area를 검증·교정한다. (2026-08-23, 2026-08-31 정정)
//
// ⚠️ 2026-08-31 정정(decisions#910): 이 스크립트는 원래 "2026-07-01 인천 2군9구 개편"(중구·동구→
//   제물포구/영종구, 서구→검단구/서해구)이 실제 일어난 개편이라고 전제하고 있었다. coordination#354
//   조사 결과 그 개편 자체가 실존하지 않는 환각이었다(과거 에이전트가 만들어 "공식 확인"이라 박아넣음) —
//   즉 이 스크립트가 실제로 존재하는 area='인천 서구'/'인천 미추홀구' 등을 "폐지된 구"로 오판하고
//   실존하지 않는 area='인천 제물포구'/'검단구'/'서해구'/'영종구'로 **잘못 바꿔온 것이 오염의 원인**이다
//   (검증: 729건이 이렇게 area가 가짜 구명으로 바뀌어 있었다). 인천 행정구역은 애초에 폐지·신설 없이
//   중구·동구·미추홀구·연수구·남동구·부평구·계양구·서구·강화군·옹진군 10개 그대로다 — 주소에 적힌 구명이
//   항상 곧 정답이므로 동(dong) 기반 추정 로직 자체가 불필요해 전부 제거했다.
//
// 판정 원리(결정론): 주소에서 구/군 토큰을 뽑아 현재 area와 비교. 다르면 교정 대상, 못 뽑으면 건드리지 않는다.
//
// 사용: node --import tsx scripts/fix-incheon-area.mjs [--apply]
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes("--apply");

const guFromAddr = (addr) => {
  const m = String(addr || "").match(/인천(?:광역시)?\s*([가-힣]+구|[가-힣]+군)/);
  return m ? m[1] : null;
};

const rows = await sql`SELECT id, name, area, dong, address FROM cafes
  WHERE published AND area LIKE '인천%' AND address LIKE '%인천%'`;

let checked = 0, ok = 0, fix = [], skip = [];
for (const c of rows) {
  checked++;
  const cur = String(c.area).replace(/^인천\s*/, "");
  const truth = guFromAddr(c.address);
  if (!truth) { skip.push([c, "주소에서 구 추출 실패"]); continue; }
  if (truth === cur) { ok++; continue; }
  fix.push([c, `인천 ${truth}`]);
}
console.log(`${APPLY ? "🟢 실행" : "🔎 드라이런"} — 인천 공개 ${checked}곳`);
console.log(`  정상 ${ok} · 교정대상 ${fix.length} · 판별불가(건드리지 않음) ${skip.length}`);
const by = {};
for (const [c, t] of fix) { const k = `${c.area} → ${t}`; by[k] = (by[k] || 0) + 1; }
console.log("\n  교정 내역:");
for (const [k, n] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(30)} ${n}곳`);
const FOCUS = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
const shown = FOCUS ? fix.filter(([c]) => c.area.includes(FOCUS)) : fix.slice(0, 5);
console.log(`\n  ${FOCUS ? FOCUS + " 전건" : "샘플"}:`);
for (const [c, t] of shown) console.log(`    #${c.id} ${c.name} [${c.dong}] ${c.area} → ${t}  (${String(c.address).slice(0, 46)})`);
if (skip.length) { console.log("\n  판별불가 샘플:"); for (const [c, why] of skip.slice(0, 4)) console.log(`    #${c.id} ${c.name} [${c.dong}] — ${why}`); }

if (APPLY && fix.length) {
  let done = 0;
  for (const [c, t] of fix) { await sql`UPDATE cafes SET area=${t}, updated_at=now() WHERE id=${c.id}`; done++; }
  console.log(`\n✅ ${done}곳 교정 완료`);
  const { invalidateCafeCaches } = await import("../lib/cafeCacheInvalidate.ts");
  await invalidateCafeCaches(fix.map(([c]) => c.id)).catch(() => {});
  console.log("   캐시 무효화 요청 완료");
}
