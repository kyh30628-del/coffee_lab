// raw 캐시 예열 — 로컬(맥)에서 직접 실행. raw 없는 카페를 네이버·유튜브·구글로 수집→raw_reviews 저장(+합성·등급·공개).
// 막힘에 강함: 네이버 쿼터/DB 쿼터/연속 오류 시 '깨끗이 중단' → 다음 회차(4시간마다)가 큐 앞부터 자동 재개.
// 사람이 재실행할 필요 없음. 큐(raw_reviews IS NULL)를 앞에서부터 순차 소진.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { synthAndStore } = await import("../lib/synthStore.ts");
const { sql } = await import("../lib/db.ts");

const MAX = Number(process.env.WARMUP_MAX || 400);   // 1회 상한(4시간마다 도니 분산)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let done = 0, skipped = 0, consecSkip = 0, consecErr = 0, stop = "";

try {
  while (done + skipped < MAX && !stop) {
    // ① 신규(raw 없음) 우선 수집. ② 신규가 없으면 '가장 오래 전 수집된 카페부터' 후기 재수집(refresh)으로 신선도 유지.
    //    → 큐가 비어도 멈추지 않고 네이버 한도를 매일 후기 갱신에 활용(사장님 지적: 시키지 않으면 안 돈다 → 상시 자동 갱신).
    let rows, refresh = false;
    try {
      rows = await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NULL ORDER BY id LIMIT 10`;
      if (!rows.length) {
        rows = await sql`SELECT id, name, area FROM cafes ORDER BY COALESCE(raw_checked_at, raw_collected_at) ASC NULLS FIRST LIMIT 10`;
        refresh = true; // 재수집 모드(네이버 새로 호출). gatherRaw가 raw_checked_at=now()로 갱신 → 자동 순환(내용 바뀐 것만 raw_collected_at 갱신=재판정)
      }
    }
    catch (e) { stop = "DB 조회 실패(쿼터?) — 중단, 다음 회차 재개: " + String(e).slice(0, 50); break; }
    if (!rows.length) { stop = "카페 없음"; break; }
    for (const c of rows) {
      try {
        const r = await synthAndStore(c, { refresh });
        if (r && r.skipped) { skipped++; consecSkip++; }
        else { done++; consecSkip = 0; consecErr = 0; if (done % 20 === 0) console.log(`  …${done}곳 수집 (${c.name})`); }
      } catch (e) {
        consecErr++;
        console.log(`  ✗ ${c.name}: ${String(e).slice(0, 70)}`);
      }
      if (consecSkip >= 12) { stop = "네이버 쿼터 소진 추정 — 중단(다음 회차 재개)"; break; }
      if (consecErr >= 8) { stop = "연속 오류(DB/쿼터 추정) — 중단(다음 회차 재개)"; break; }
      await sleep(250);
    }
  }
} catch (e) { stop = "예외 — 중단(다음 회차 재개): " + String(e).slice(0, 50); }

console.log(stop || "상한 도달");
let remain = "?";
try { remain = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE raw_reviews IS NULL`)[0].n; } catch {}
console.log(`예열 종료: 이번 ${done}곳 수집 · 보존 ${skipped} · raw 남음 ${remain}`);
process.exit(0);
