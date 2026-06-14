// 동(洞) 단위 발굴 스윕 — 전 지역(또는 SWEEP_SIDO 지정 시도)을 순회하며 신규 독립카페를 적재.
// 신규는 pipeline_status='new'(비공개)로 들어가고, warmup/judgeloop이 raw 수집→합성→판정→검증 후 공개.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { discoverRegion, METRO_REGIONS } = await import("../lib/discover.ts");
const { sql } = await import("../lib/db.ts");

const onlySido = process.env.SWEEP_SIDO || ""; // 예: '서울'. 비우면 전체.
const regions = METRO_REGIONS.filter((r) => !onlySido || r.region.startsWith(onlySido));
let totalNew = 0, done = 0;
console.log(`발굴 스윕 시작 — 대상 ${regions.length}개 지역${onlySido ? ` (${onlySido})` : ""}`);

for (const r of regions) {
  try {
    const res = await discoverRegion(r.region, r.areaLabel);
    await sql`UPDATE discovery_state SET last_run=now(), last_found=${res.found}, last_inserted=${res.inserted} WHERE region=${r.region}`;
    totalNew += res.inserted; done++;
    console.log(`[${done}/${regions.length}] ${r.region}: 발견 ${res.found} · 신규 ${res.inserted} (누적 신규 ${totalNew})`);
  } catch (e) {
    const msg = String(e).slice(0, 80);
    console.log(`[${done}/${regions.length}] ${r.region}: 오류 — ${msg}`);
    if (/quota|한도|429|exceed/i.test(msg)) { console.log("네이버 한도 추정 — 중단(다음 회차 재개)"); break; }
  }
}
console.log(`스윕 종료 — 처리 ${done}개 지역 · 신규 카페 ${totalNew}곳 적재. 이제 warmup/judgeloop이 자동 합성·판정·검증→공개.`);
process.exit(0);
