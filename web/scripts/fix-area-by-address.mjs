// 🧭 area 오귀속 교정 — 주소를 진실원본으로 삼아 DB의 area를 검증·교정한다. (2026-09-18 신설)
//
// 왜 필요한가: 발굴이 지역을 검색하며 도는 구조라, **도 경계 너머 카페를 긁어오면 검색하던 지역명이
//   그대로 area로 박힌다.** 실측(09-18): 서천군(충남) 검색에서 군산시(전북) 카페 23곳,
//   함양군(경남)에서 남원시 14곳, 수도권 발굴에서 제주 카페 16곳.
//   area가 틀리면 지역·지역×취향 페이지에 안 잡힌다 — 유기유입의 78%가 그 경로다.
//
// 판정 원리(결정론): 주소 2번째 토큰이 그 시·도의 **정당한 시군구 목록에 있을 때만** 교정한다.
//   못 뽑거나 목록에 없으면 건드리지 않는다(판별 불가 = 보존). 추측 매핑은 하지 않는다.
//   ⚠️ 인천처럼 행정구역 개편이 얽힌 곳은 이 도구를 쓰지 말 것 — scripts/fix-incheon-area.mjs가
//      공식 근거 기반 동(dong) 매핑을 따로 한다. 여기서는 단순 오귀속만 다룬다.
//
// 사용: node --import tsx scripts/fix-area-by-address.mjs --sido 전북 [--apply]
import { readFileSync, writeFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { SIDO_GU } = await import("../lib/regionList.ts");

const ADDR_PREFIX = {
  전북: "전북특별자치도", 전남: "전라남도", 경남: "경상남도", 경북: "경상북도",
  충남: "충청남도", 충북: "충청북도", 강원: "강원특별자치도", 제주: "제주특별자치도",
  울산: "울산광역시", 광주: "광주광역시", 대전: "대전광역시", 대구: "대구광역시", 부산: "부산광역시",
};
const PREFIXED = new Set(["인천", "대전", "부산", "대구", "광주", "울산"]);

const argi = process.argv.indexOf("--sido");
const SIDO = argi > 0 ? process.argv[argi + 1] : null;
const APPLY = process.argv.includes("--apply");
if (!SIDO || !ADDR_PREFIX[SIDO]) { console.log(`--sido 필요. 지원: ${Object.keys(ADDR_PREFIX).join(", ")}`); process.exit(1); }
if (SIDO === "인천") { console.log("인천은 fix-incheon-area.mjs를 쓸 것(개편 매핑 필요)"); process.exit(1); }

const gus = SIDO_GU[SIDO] ?? [];
const label = (g) => (PREFIXED.has(SIDO) ? `${SIDO} ${g}` : g);
// 🔴 동명 시군 가드(2026-09-18) — 접두 없는 시·도에도 **동명 때문에 접두를 붙인 정당 라벨**이 있다.
//   실측: 고성군이 강원(area='고성군' 105곳)·경남(area='경남 고성군' 57곳) 둘 다 존재하고,
//   canonicalGu('경남 고성군')이 정상 해석한다. 이걸 '오귀속'으로 보고 '고성군'으로 바꾸면
//   **두 고성군이 한 지역으로 합쳐진다**(공개 65 + 30곳 오염). 그래서 접두 변형도 정당 라벨로 인정한다.
const okLabels = [...new Set([...gus.map(label), ...gus.map((g) => `${SIDO} ${g}`)])];
const rows = await sql`SELECT id, name, area, address, published FROM cafes
  WHERE address LIKE ${ADDR_PREFIX[SIDO] + " %"} AND area <> ALL(${okLabels}) ORDER BY id`;

const fix = [], skip = [];
for (const c of rows) {
  const tok = String(c.address).split(" ")[1] ?? "";
  if (gus.includes(tok)) fix.push({ id: c.id, name: c.name, from: c.area, to: label(tok), pub: c.published });
  else skip.push({ id: c.id, name: c.name, tok, addr: String(c.address).slice(0, 55) });
}
console.log(`🔎 ${SIDO} — 주소=${ADDR_PREFIX[SIDO]}인데 area가 ${SIDO} 소속이 아닌 카페 ${rows.length}곳`);
console.log(`   교정대상 ${fix.length} · 판별불가(보존) ${skip.length} · 그중 공개중 ${fix.filter((f) => f.pub).length}곳`);
const grouped = {};
for (const f of fix) { const k = `${f.from} → ${f.to}`; grouped[k] = (grouped[k] ?? 0) + 1; }
console.log("\n   교정 맵:");
for (const [k, v] of Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`     ${k.padEnd(26)} ${v}곳`);
if (skip.length) { console.log("\n   판별불가 샘플:"); skip.slice(0, 5).forEach((s) => console.log(`     #${s.id} ${s.name} 토큰="${s.tok}" · ${s.addr}`)); }

if (!APPLY) { console.log("\n▶ 드라이런이다. 실제로 고치려면 --apply"); process.exit(0); }
const bak = `/tmp/area-fix-${SIDO}-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(bak, JSON.stringify(fix, null, 1));
for (const f of fix) await sql`UPDATE cafes SET area=${f.to} WHERE id=${f.id}`;
console.log(`\n✅ ${fix.length}곳 교정 · 복구용 ${bak}`);
const { invalidateCafeCaches } = await import("../lib/cafeCacheInvalidate.ts");
await invalidateCafeCaches(fix.map((f) => f.id)).catch((e) => console.log("캐시 무효화 실패(비치명):", String(e).slice(0, 60)));
console.log("   캐시 무효화 요청 완료");
const [v] = await sql`SELECT COUNT(*)::int n FROM cafes WHERE address LIKE ${ADDR_PREFIX[SIDO] + " %"} AND area <> ALL(${okLabels})`;
console.log(`   검증: 남은 불일치 ${v.n}곳 (판별불가 ${skip.length}곳과 같아야 정상)`);
