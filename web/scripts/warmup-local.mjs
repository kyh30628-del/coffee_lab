// raw 캐시 예열 — 로컬(맥)에서 직접 실행(Vercel 함수 타임아웃 회피).
// raw 없는 카페를 네이버·유튜브·구글로 수집해 raw_reviews에 저장(+합성·등급·공개).
// 한 번 채우면 재합성·판정은 재호출 없이 재사용. 네이버 일일 쿼터 안에서 점진 진행.
// 실행(tsx 필요): node_modules/.bin/tsx scripts/warmup-local.mjs
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { synthAndStore } = await import("../lib/synthStore.ts");
const { sql } = await import("../lib/db.ts");

const MAX = Number(process.env.WARMUP_MAX || 2500);
let done = 0, skipped = 0, consecSkip = 0;

while (done + skipped < MAX) {
  const rows = await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NULL ORDER BY id LIMIT 10`;
  if (!rows.length) { console.log("raw NULL 카페 없음 — 전체 완료"); break; }
  for (const c of rows) {
    try {
      const r = await synthAndStore(c, { refresh: false }); // 캐시 없으면 새로 수집·저장
      if (r && r.skipped) { skipped++; consecSkip++; }
      else { done++; consecSkip = 0; if (done % 20 === 0) console.log(`  …${done}곳 수집 (${c.name})`); }
    } catch (e) { console.log(`  ✗ ${c.name}: ${String(e).slice(0, 80)}`); }
    if (consecSkip >= 12) break; // 연속 보존 = 네이버 쿼터 소진
    await new Promise((r) => setTimeout(r, 250));
  }
  if (consecSkip >= 12) { console.log("네이버 쿼터 소진 추정 — 오늘 예열 중단(내일 이어서)"); break; }
}
const remain = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE raw_reviews IS NULL`)[0].n;
console.log(`\n예열 종료: 이번 ${done}곳 수집 · 보존 ${skipped} · raw 남음 ${remain}`);
process.exit(0);
