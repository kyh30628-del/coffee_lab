// 🧭 인천 area 오분류 교정 — 주소를 진실원본으로 삼아 DB의 area를 검증·교정한다. (2026-08-23)
//
// 배경: 2026-07-01 인천 2군9구 개편(옛 중구·동구→제물포구/영종구, 옛 서구→검단구/서해구) 재분류 과정에서
//   일부 카페가 엉뚱한 구로 들어갔다. 실측 사례 —
//     구월동(남동구) 카페들이 `인천 미추홀구`로 · 청천동/삼산동(부평구)이 `인천 계양구`로 · 송림동(제물포구)이 `미추홀구`로.
//   소비자 손상: 지역 페이지·지도 필터가 다른 구 카페를 섞어 보여준다.
//
// 판정 원리(결정론):
//   ① 주소에서 구/군을 뽑는다. 현존 구면 그대로 정답.
//   ② 폐지된 구(중구·동구·서구)면 **동(dong)으로 신설구를 판정** — lib/discover.ts의 DONGS를 단일출처로 쓴다.
//      (중구는 영종 권역만 영종구, 나머지 육지부는 제물포구 / 동구는 전부 제물포구 / 서구는 검단·서해로 갈림)
//   ③ 동으로도 못 가리면 **건드리지 않는다**(추측 금지 — 틀린 교정이 방치보다 나쁘다).
//
// 사용: node --import tsx scripts/fix-incheon-area.mjs [--apply]
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { DONGS } = await import("../lib/discover.ts");
const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes("--apply");

const LIVE = ["미추홀구", "연수구", "남동구", "부평구", "계양구", "검단구", "서해구", "영종구", "제물포구", "강화군", "옹진군"];
const ABOLISHED = ["중구", "동구", "서구"];
// 폐지구 → 후보 신설구(동으로 가린다)
const SPLIT = { 중구: ["영종구", "제물포구"], 동구: ["제물포구"], 서구: ["검단구", "서해구"] };

const guFromAddr = (addr) => {
  const m = String(addr || "").match(/인천(?:광역시)?\s*([가-힣]+구|[가-힣]+군)/);
  return m ? m[1] : null;
};
const guFromDong = (dong, candidates) => {
  if (!dong) return null;
  const hits = candidates.filter((g) => (DONGS?.[g] || []).some((d) => dong.startsWith(d) || d.startsWith(dong)));
  return hits.length === 1 ? hits[0] : null;   // 애매하면 포기(추측 금지)
};

const rows = await sql`SELECT id, name, area, dong, address FROM cafes
  WHERE published AND area LIKE '인천%' AND address LIKE '%인천%'`;

let checked = 0, ok = 0, fix = [], skip = [];
for (const c of rows) {
  checked++;
  const cur = String(c.area).replace(/^인천\s*/, "");
  const gu = guFromAddr(c.address);
  if (!gu) { skip.push([c, "주소에서 구 추출 실패"]); continue; }
  let truth = null;
  if (LIVE.includes(gu)) truth = gu;
  else if (ABOLISHED.includes(gu)) truth = guFromDong(c.dong, SPLIT[gu]) || (SPLIT[gu].length === 1 ? SPLIT[gu][0] : null);
  if (!truth) { skip.push([c, `폐지구(${gu}) — 동으로 판별 불가`]); continue; }
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
