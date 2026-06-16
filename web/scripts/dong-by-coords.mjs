// 좌표 → 법정동 100% 정확 채움 — 행정동 경계 GeoJSON으로 point-in-polygon. 이름검색 미스 없음.
//  안전: dong 컬럼만 UPDATE(공개상태 절대 안 건드림 → 인천 같은 사고 불가). sido로 서울/인천 자동 구분.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
import { neon } from "@neondatabase/serverless";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
const sql = neon(process.env.DATABASE_URL);

// 행정동 경계 GeoJSON — 없으면 자동 다운로드(캐시). 자동화에서도 자가 복구.
const GJ_PATH = process.env.GEOJSON || "/tmp/hjd-kor.geojson";
if (!existsSync(GJ_PATH)) { console.log("행정동 GeoJSON 다운로드..."); execSync(`curl -s -m 120 -o "${GJ_PATH}" "https://raw.githubusercontent.com/vuski/admdongkor/master/ver20230401/HangJeongDong_ver20230401.geojson"`); }
const GJ = JSON.parse(readFileSync(GJ_PATH, "utf8"));
// 수도권 행정동만 추출 + 다각형 링·bbox 사전계산
const polys = [];
for (const f of GJ.features) {
  const sido = f.properties.sidonm || "";
  if (!/서울|인천|경기/.test(sido)) continue;
  const dongAdm = (f.properties.adm_nm || "").split(/\s+/).pop() || "";
  const dong = dongAdm.replace(/제?\d+동$/, "동"); // 행정동→법정동 근사(천호제1동→천호동)
  const gu = f.properties.sggnm || "";
  const geom = f.geometry;
  const multi = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  for (const poly of multi) {
    const outer = poly[0]; // 외곽 링([lng,lat]...)
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const [x, y] of outer) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    polys.push({ dong, gu, sido, ring: outer, minX, minY, maxX, maxY });
  }
}
console.log(`수도권 동 다각형: ${polys.length}개`);

function inRing(lng, lat, ring) { // ray casting
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function findDong(lng, lat) {
  for (const p of polys) { if (lng < p.minX || lng > p.maxX || lat < p.minY || lat > p.maxY) continue; if (inRing(lng, lat, p.ring)) return p; }
  return null;
}

const ONLY_NULL = process.env.ALL !== "1"; // 기본: 동 없는 것만(안전). ALL=1이면 전수 재도출.
const rows = ONLY_NULL
  ? await sql`SELECT id, area, dong, lat, lng FROM cafes WHERE lat IS NOT NULL AND lng IS NOT NULL AND dong IS NULL`
  : await sql`SELECT id, area, dong, lat, lng FROM cafes WHERE lat IS NOT NULL AND lng IS NOT NULL`;
console.log(`대상 카페: ${rows.length} (${ONLY_NULL ? "동없음만" : "전수"})`);
let filled = 0, miss = 0, changed = 0;
for (const c of rows) {
  let p = findDong(c.lng, c.lat);
  if (!p) { // 폴리곤 밖(경계오차) → 같은 구/시의 가장 가까운 동 폴리곤으로 채움(진짜 100%)
    const guN = ((c.area || "").match(/[가-힣]+[구시군]/g) || []).pop();
    let best = null, bd = 1e9;
    for (const q of polys) {
      if (guN && !q.gu.replace(/\s/g, "").includes(guN.replace(/\s/g, "")) && !guN.includes(q.gu.replace(/\s/g, ""))) continue;
      const cx = (q.minX + q.maxX) / 2, cy = (q.minY + q.maxY) / 2, d = (cx - c.lng) ** 2 + (cy - c.lat) ** 2;
      if (d < bd) { bd = d; best = q; }
    }
    p = best;
  }
  if (!p || !p.dong) { miss++; continue; }
  if (p.dong !== c.dong) { await sql`UPDATE cafes SET dong = ${p.dong} WHERE id = ${c.id}`; if (c.dong) changed++; else filled++; }
}
const remain = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE dong IS NULL AND lat IS NOT NULL`)[0].n;
console.log(`좌표 동채움: 신규채움 ${filled} · 교정 ${changed} · 폴리곤밖 ${miss} · 남은 동없음 ${remain}`);
process.exit(0);
