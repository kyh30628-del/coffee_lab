#!/usr/bin/env node
// 🗺️ area 소급 재판정 — 결재 #1080 E항(CEO 승인 2026-09-14).
//   실행: node --import tsx scripts/area-rejudge.mjs          (DRY-RUN)
//         node --import tsx scripts/area-rejudge.mjs --apply  (반영)
//
// 왜 1회성이 아니라 상비 도구인가: **권역을 넓히면 과거 적재분의 area가 소급해 틀려진다.**
//   실측(2026-09-14): 경북 편입(09-11) 전에 들어온 경주시 카페 3곳이 area='송파구/용산구/마포구'로
//   남아 있었다. 유일한 자동 복구 경로(synthStore 재합성 시 parseGuArea 재적용)는 excluded·noise를
//   돌지 않아 영원히 안 고쳐진다. 권역 편입 직후 이 스크립트를 돌린다.
//
// 💰 비용: 작은 컬럼(id·area·address)만 읽는다. 큰 컬럼 미조회. 1회성.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ""); }
const APPLY = process.argv.includes("--apply");
const { sql } = await import("../lib/db.ts");
const { parseGuArea, addressSidoScope } = await import("../lib/discover.ts");

const rows = await sql`SELECT id, name, area, address, published FROM cafes WHERE address IS NOT NULL AND address <> ''`;
const fixes = [], outs = [];
for (const c of rows) {
  const sc = addressSidoScope(c.address).scope;
  if (sc === "out") { outs.push(c); continue; }
  const want = parseGuArea(c.address);
  if (want && want !== c.area) fixes.push({ ...c, want });
}
console.log(`주소 보유 ${rows.length.toLocaleString()}곳 · ${APPLY ? "APPLY" : "DRY-RUN"}`);
console.log(`  🔴 area 교정 대상: ${fixes.length}곳 (공개 ${fixes.filter((f) => f.published).length})`);
console.log(`  🚫 서비스 범위 밖 주소: ${outs.length}곳 (공개 ${outs.filter((o) => o.published).length})`);
for (const f of fixes.slice(0, 15)) console.log(`     ${f.name}: ${f.area} → ${f.want}  (${String(f.address).slice(0, 30)})`);
if (!APPLY) { console.log("\nDRY-RUN — 반영하려면 --apply"); process.exit(0); }

let fixed = 0;
for (const f of fixes) {
  await sql`UPDATE cafes SET area=${f.want}, updated_at=now() WHERE id=${f.id}`;
  fixed++;
}
// 범위 밖은 공개하지 않는다. 이미 공개 중이면 내리고, 사유를 남긴다(되돌릴 수 있게).
const outIds = outs.map((o) => Number(o.id));
let marked = 0;
for (let i = 0; i < outIds.length; i += 200) {
  const r = await sql`UPDATE cafes SET published=false,
      exclude_reason='서비스 범위 밖 — 주소 시·도가 미편입 지역(결재 #1080 소급 재판정)', exclude_at=now(), updated_at=now()
    WHERE id = ANY(${outIds.slice(i, i + 200)}) AND (published = true OR exclude_reason IS NULL) RETURNING id`;
  marked += r.length;
}
console.log(`\n✅ area 교정 ${fixed}곳 · 범위 밖 표시 ${marked}곳`);
if (fixed || marked) {
  try { const { invalidateCafeCaches } = await import("../lib/cafeCacheInvalidate.ts");
    await invalidateCafeCaches([...fixes.map((f) => Number(f.id)), ...outIds]); console.log("🧹 캐시 무효화 완료"); }
  catch (e) { console.log("⚠️ 캐시 무효화 실패:", String(e).slice(0, 70)); }
}
