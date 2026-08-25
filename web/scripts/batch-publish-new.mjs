// 이번 일괄 배치 전용 — 신규(new) 카페를 수집·합성한 뒤, 게이트 통과분(pending)을 바로 공개(live).
// AI 판정(Claude)은 건너뛴다(사장님: 점차 적용). 단 노이즈/프랜차이즈/비카페/오염 게이트는 synthAndStore에서 철저히 적용됨.
// 막힘에 강함: 네이버/DB 쿼터·연속오류 시 깨끗이 중단 → 재실행하면 큐 앞부터 이어감. 끝에 pending→공개 승격.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { synthAndStore } = await import("../lib/synthStore.ts");
const { sql } = await import("../lib/db.ts");
const { loadCriteria, getCriterionSync } = await import("../lib/criteria.ts");
await loadCriteria(); // 좌표 박스는 criteria 단일출처 — 아래에서 하드코딩을 걷어냈다
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MAX = Number(process.env.BATCH_MAX || 99999);
// 지역 한정 실행(예: --filter=강원) — 전체 큐를 건드리지 않고 이번 확장분만 처리하려고 추가(2026-08-25).
const FILTER = (process.argv.find((a) => a.startsWith("--filter=")) || "").split("=")[1] || "";
let done = 0, skipped = 0, consecSkip = 0, consecErr = 0, stop = "";

// ① 신규(raw 없음) 카페 수집·합성 → 게이트 적용(pending/rejected/noise)
try {
  while (done + skipped < MAX && !stop) {
    let rows;
    try {
      rows = FILTER
        ? await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NULL AND pipeline_status = 'new' AND address LIKE ${FILTER + "%"} ORDER BY id LIMIT 10`
        : await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NULL AND pipeline_status = 'new' ORDER BY id LIMIT 10`;
    }
    catch (e) { stop = "DB 조회 실패(쿼터?) — 중단: " + String(e).slice(0, 50); break; }
    if (!rows.length) { stop = "신규(new) 큐 소진"; break; }
    for (const c of rows) {
      try {
        const r = await synthAndStore(c, { refresh: false });
        if (r && r.skipped) { skipped++; consecSkip++; }
        else { done++; consecSkip = 0; consecErr = 0; if (done % 20 === 0) console.log(`  …${done}곳 합성 (${c.name})`); }
      } catch (e) { consecErr++; console.log(`  ✗ ${c.name}: ${String(e).slice(0, 60)}`); }
      if (consecSkip >= 12) { stop = "네이버 쿼터 소진 추정 — 중단(재실행시 재개)"; break; }
      if (consecErr >= 8) { stop = "연속 오류 — 중단(재실행시 재개)"; break; }
      await sleep(250);
    }
  }
} catch (e) { stop = "예외 — 중단: " + String(e).slice(0, 50); }

console.log(stop || "상한 도달");

// ② 게이트 통과분(pending)을 바로 공개(live) — 이번 배치 한정, AI 판정 생략. 좌표 유효성도 확인.
let promoted = 0;
try {
  // 🚨 2026-08-25 수정: 여기 좌표가 36.8~38.3 / 124.5~127.9로 **하드코딩**돼 있었다.
  //   criteria로 박스를 넓혀도(강원 편입) 이 승격 경로만 옛 박스를 써서 강원이 통째로 탈락한다 —
  //   기준 단일출처의 존재 이유가 바로 이런 조용한 드리프트다. criteria에서 읽도록 교정.
  const latMin = getCriterionSync("geo.box.lat_min"), latMax = getCriterionSync("geo.box.lat_max");
  const lngMin = getCriterionSync("geo.box.lng_min"), lngMax = getCriterionSync("geo.box.lng_max");
  const rows = FILTER
    ? await sql`UPDATE cafes SET published = true, pipeline_status = 'live'
        WHERE pipeline_status = 'pending' AND address LIKE ${FILTER + "%"}
          AND lat IS NOT NULL AND lat BETWEEN ${latMin} AND ${latMax} AND lng BETWEEN ${lngMin} AND ${lngMax}
        RETURNING id`
    : await sql`UPDATE cafes SET published = true, pipeline_status = 'live'
        WHERE pipeline_status = 'pending'
          AND lat IS NOT NULL AND lat BETWEEN ${latMin} AND ${latMax} AND lng BETWEEN ${lngMin} AND ${lngMax}
        RETURNING id`;
  promoted = rows.length;
} catch (e) { console.log("승격 실패: " + String(e).slice(0, 60)); }

let stat = {};
try {
  const r = await sql`SELECT
    count(*) FILTER (WHERE pipeline_status='new')::int as new,
    count(*) FILTER (WHERE pipeline_status='pending')::int as pending,
    count(*) FILTER (WHERE pipeline_status='live')::int as live,
    count(*) FILTER (WHERE pipeline_status='rejected')::int as rejected,
    count(*) FILTER (WHERE pipeline_status='noise')::int as noise
    FROM cafes`;
  stat = r[0];
} catch {}
console.log(`이번 합성 ${done}곳 · 공개 승격 ${promoted}곳`);
console.log(`파이프라인 현황:`, JSON.stringify(stat));
process.exit(0);
