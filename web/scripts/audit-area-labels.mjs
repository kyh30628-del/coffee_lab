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

if (unresolved.length) console.log(`\n⚠️ 시군구 못 찾은 ${unresolved.length}곳(건드리지 않음): ` + unresolved.slice(0, 5).map(c => `${c.name}[${String(c.address).slice(0,20)}]`).join(" · "));

if (!APPLY) { console.log("\n--apply 로 실행할 것"); process.exit(0); }
let n = 0;
for (let i = 0; i < fixes.length; i += 100) {
  const chunk = fixes.slice(i, i + 100);
  for (const f of chunk) { await sql`UPDATE cafes SET area = ${f.to}, updated_at = now() WHERE id = ${f.id}`; n++; }
}
console.log(`\n✅ ${n}곳 라벨 교정`);
try { const { invalidateCafeCaches } = await import("../lib/cafeCacheInvalidate.ts"); await invalidateCafeCaches(fixes.map(f => f.id)); console.log("🧹 캐시 무효화 완료"); }
catch (e) { console.log("⚠️ 캐시 무효화 실패:", String(e).slice(0, 80)); }
