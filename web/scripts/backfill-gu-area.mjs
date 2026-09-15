// 🧭 광역시-구 충돌 area 오귀속 일회성 백필 (decisions#1078, 출처 협업#408 §3-A/B).
//
// 배경: decisions#1064(2026-09-13)가 lib/discover.ts의 AMBIG_SIDO_CANDIDATES→PREFIXED_SIDOS
//   단일출처화로 신규 편입(대구 등) 시 구명(중구·동구·서구·남구·북구 등) 충돌 disambiguation 버그를
//   코드로는 고쳤지만, parseGuArea는 discover.ts 삽입 시점에만 호출되고 resynth 경로엔 없어
//   **기존에 이미 잘못 찍힌 행은 코드 배포로 소급 교정되지 않는다**(부산253+대구+대전+인천=270여건, 대부분 published=false).
//
// 판정 원리(결정론, 인천 729건 사고 재발방지 그대로 계승): "area가 광역시X로 시작하는데 address엔
//   그 광역시명이 전혀 없다" — 즉 검색쿼리 라벨(area)이 실제 주소가 말하는 도시와 다른 도시로 찍힌
//   교차오염만 고른다. 부산/대구/대전/인천 4곳만 본다(이 4곳만 구명 충돌 이력이 실증됨, report H2).
//   ⚠️ 전 테이블에 parseGuArea를 맹목적으로 재적용하면 안 된다 — 실측(dev-task-1078 조사): 인천 2군9구
//   개편 이전 표기("인천광역시 서구")로 남아있는 정상 인천 주소까지 SIDO_GU에 옛 구명이 없어 전역
//   GU_TO_AREA 폴백으로 떨어져 '대구 서구' 등 엉뚱한 값으로 재오염된다(190건 시뮬레이션 확인) — 그래서
//   반드시 "area 도시 ≠ address 도시가 명백한" 좁은 집합만 대상으로 삼는다.
//
// 각 대상 행에 대해 현재 코드의 parseGuArea(address)를 재적용해 실제로 다른 값이 나올 때만 교정한다
// (대구·전북 등 미편입 도시로 잘못 찍힌 행은 parseGuArea도 disambiguation 불가라 값이 그대로라 자동 스킵됨 — 안전).
//
// 사용: node --import tsx scripts/backfill-gu-area.mjs [--apply]
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const { parseGuArea } = await import("../lib/discover.ts");
const APPLY = process.argv.includes("--apply");

const CITIES = ["부산", "대구", "대전", "인천"];

let checked = 0, fix = [], unfixable = [];
for (const city of CITIES) {
  const rows = await sql`SELECT id, name, area, address, published FROM cafes
    WHERE area LIKE ${city + "%"} AND address IS NOT NULL AND address <> '' AND address NOT LIKE ${"%" + city + "%"}`;
  for (const c of rows) {
    checked++;
    const computed = parseGuArea(c.address);
    if (computed && computed !== c.area) fix.push([c, computed]);
    else unfixable.push(c); // 미편입 도시(광주·울산 등) 주소 — 현재 코드로는 판별 불가, 건드리지 않음
  }
}

console.log(`${APPLY ? "🟢 실행" : "🔎 드라이런"} — 광역시-구 충돌 의심 ${checked}곳 검사`);
console.log(`  교정대상(parseGuArea 재적용 시 값이 바뀜) ${fix.length} · 판별불가(현재 코드로 값 불변, 미건드림) ${unfixable.length}`);
console.log(`  교정대상 중 published=true ${fix.filter(([c]) => c.published).length}곳`);

const by = {};
for (const [c, t] of fix) { const k = `${c.area} → ${t}`; by[k] = (by[k] || 0) + 1; }
console.log("\n  교정 내역:");
for (const [k, n] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(24)} ${n}곳`);

console.log("\n  샘플(최대 8):");
for (const [c, t] of fix.slice(0, 8)) console.log(`    #${c.id} ${c.name} [${c.published ? "공개" : "비공개"}] ${c.area} → ${t}  (${String(c.address).slice(0, 46)})`);

if (unfixable.length) {
  const byU = {};
  for (const c of unfixable) { const k = c.area; byU[k] = (byU[k] || 0) + 1; }
  console.log("\n  판별불가 내역(미편입 도시 등 — 별도 코드작업 필요, decisions#1080 영역):");
  for (const [k, n] of Object.entries(byU).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(24)} ${n}곳`);
}

if (APPLY && fix.length) {
  let done = 0;
  const publishedIds = [];
  for (const [c, t] of fix) {
    await sql`UPDATE cafes SET area=${t}, updated_at=now() WHERE id=${c.id}`;
    done++;
    if (c.published) publishedIds.push(c.id);
  }
  console.log(`\n✅ ${done}곳 교정 완료`);
  if (publishedIds.length) {
    const { invalidateCafeCaches } = await import("../lib/cafeCacheInvalidate.ts");
    await invalidateCafeCaches(publishedIds).catch(() => {});
    console.log(`   공개 ${publishedIds.length}곳 캐시 무효화 요청 완료`);
  }
}
