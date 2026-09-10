// 🗺️ 지역 라벨이 실제 주소와 어긋난 공개 카페 교정 — CEO 지시(2026-09-10).
//   기본은 DRY-RUN. --apply 를 줘야 저장한다.
//   라벨 생성은 lib/regionList.regionKeyFor 단일 출처만 쓴다(복제 금지 — 09-04 교훈).
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ""); }
const APPLY = process.argv.includes("--apply");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const { regionKeyFor, SIDO_GU } = await import("../lib/regionList.ts");

// 주소 첫 토큰 → 우리 시도 표기
const SIDO_OF_ADDR = [["서울","서울"],["경기","경기"],["인천","인천"],["강원","강원"],["충청북도","충북"],["충청남도","충남"],["대전","대전"],["세종","세종"],["부산","부산"],["경상남도","경남"],["대구","대구"],["경상북도","경북"],["광주광역시","광주"],["전북","전북"],["전라남도","전남"],["울산","울산"],["제주","제주"]];
const sidoOf = (addr) => { const a = String(addr || ""); for (const [pre, label] of SIDO_OF_ADDR) if (a.startsWith(pre)) return label; return null; };
/** 주소에서 그 시도의 시군구를 찾는다(가장 긴 이름 우선 — 부분일치 오분류 차단). */
const guOf = (addr, sido) => {
  const list = [...(SIDO_GU[sido] ?? [])].sort((a, b) => b.length - a.length);
  // 🏙️ 단층 자치시(세종)는 주소에 시군구 이름이 안 적힌다 — 목록이 하나면 그곳이다.
  if (list.length === 1) return list[0];
  const a = String(addr || "");
  for (const gu of list) if (a.includes(gu)) return gu;
  return null;
};

const rows = await sql`SELECT id, name, area, address FROM cafes WHERE published AND address IS NOT NULL AND address <> ''`;
const fixes = [], unresolved = [];
for (const c of rows) {
  const sido = sidoOf(c.address); if (!sido) continue;
  const gu = guOf(c.address, sido);
  if (!gu) { if (c.area) unresolved.push(c); continue; }
  const want = regionKeyFor(sido, gu);
  if (want && c.area !== want) fixes.push({ id: Number(c.id), name: c.name, from: c.area, to: want, addr: c.address });
}
console.log(`공개 카페 ${rows.length.toLocaleString()}곳 검사 · 라벨 교정 대상 ${fixes.length}곳 · 시군구 판정 불가 ${unresolved.length}곳`);
console.log(APPLY ? "APPLY(저장)\n" : "DRY-RUN(저장 안 함)\n");

const byPair = {};
for (const f of fixes) { const k = `${f.from} → ${f.to}`; (byPair[k] ??= []).push(f); }
for (const [k, v] of Object.entries(byPair).sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${String(v.length).padStart(4)}곳  ${k}   예: ${v[0].name} (${String(v[0].addr).slice(0, 32)})`);

// ⚠️ 주소만으로 시군구를 못 정하는 곳(인천 옛 구명 — 2026-07-01 2군9구 개편으로 중·동·서구 폐지).
//   옛 구 하나가 새 구 둘로 갈렸으므로 **옛 주소만으로는 새 구를 특정할 수 없다** — 추측해서 바꾸지 않는다.
//   대신 "라벨이 최소한 유효한 지역인가"는 검증한다. 그래야 이 무리 안에서 틀려도 잡힌다.
if (unresolved.length) {
  const valid = new Set(Object.entries(SIDO_GU).flatMap(([sd, list]) => list.map((g) => regionKeyFor(sd, g))));
  const bad = unresolved.filter((c) => !c.area || !valid.has(c.area));
  console.log(`\n⚠️ 주소로 시군구 판정 불가 ${unresolved.length}곳 — 라벨 유효성만 검사: ${bad.length ? `❌ 유효하지 않은 라벨 ${bad.length}곳` : "✅ 전부 유효한 지역 라벨"}`);
  for (const c of bad.slice(0, 10)) console.log(`    #${c.id} ${c.name} · area="${c.area}" · ${String(c.address).slice(0, 34)}`);
  if (!bad.length) console.log(`    (인천 옛 구명 주소 — 라벨은 개편 후 새 구로 정상 부여됨)`);
}

if (!APPLY) { console.log("\n--apply 로 실행할 것"); process.exit(0); }
let n = 0;
for (let i = 0; i < fixes.length; i += 100) {
  const chunk = fixes.slice(i, i + 100);
  for (const f of chunk) { await sql`UPDATE cafes SET area = ${f.to}, updated_at = now() WHERE id = ${f.id}`; n++; }
}
console.log(`\n✅ ${n}곳 라벨 교정`);
try { const { invalidateCafeCaches } = await import("../lib/cafeCacheInvalidate.ts"); await invalidateCafeCaches(fixes.map(f => f.id)); console.log("🧹 캐시 무효화 완료"); }
catch (e) { console.log("⚠️ 캐시 무효화 실패:", String(e).slice(0, 80)); }
