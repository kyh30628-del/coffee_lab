// 🧳🏠 방문객 성격 비율 소급 계산 — 이미 합성된 카페에 visitor_n/trip/local을 채운다. (2026-08-25)
//
// 왜 스크립트가 필요한가: 계산은 합성(storeResult) 때 자동으로 들어가지만, 재합성 회전이
//   cron-resynth LIMIT 3 · cron-synth LIMIT 8이라 기존 2만여 곳이 다 채워지려면 수년이 걸린다.
//   배지가 일부에만 보이면 "왜 얘만 붙지"가 되므로 한 번에 채운다.
//
// ⚠️ SQL 정규식으로 근사하지 않는다 — lib/visitorMix.ts의 **실제 함수**를 그대로 쓴다.
//   근사하면 소급값과 이후 합성값이 미세하게 어긋나고, 그 불일치는 나중에 원인을 못 찾는다
//   (정확성=서비스 그 자체 원칙). 대신 배치로 끊어 전송량을 통제한다.
//
// 💰 비용: synth_reviews_all은 곳당 평균 4KB(raw_reviews 64KB와 달리 작다). 배치 500곳=2MB,
//   전량 약 90MB 1회. 큰 컬럼(raw_reviews) 전수 스캔은 하지 않는다.
//
// 사용: node --import tsx scripts/backfill-visitor-mix.mjs [--apply] [--limit=N]
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { visitorMix, visitorBadges } = await import("../lib/visitorMix.ts");
const { loadCriteria } = await import("../lib/criteria.ts");
const sql = neon(process.env.DATABASE_URL);

const APPLY = process.argv.includes("--apply");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1] || 0);
const BATCH = 500;

await loadCriteria(); // 배지 판정 임계(criteria 단일출처) 프라임 — 미리보기 집계용

let cursor = 0, seen = 0, wrote = 0, trip = 0, local = 0;
const samples = [];
for (;;) {
  const rows = await sql`SELECT id, name, area, synth_reviews_all AS s
    FROM cafes WHERE synth_reviews_all IS NOT NULL AND id > ${cursor}
    ORDER BY id LIMIT ${BATCH}`;
  if (!rows.length) break;
  cursor = rows[rows.length - 1].id;

  for (const c of rows) {
    seen++;
    const mix = visitorMix((c.s || []).map((r) => r?.quote || ""));
    const b = visitorBadges(mix);
    if (b.some((x) => x.key === "trip")) { trip++; if (samples.length < 20) samples.push(`🧳 ${c.name} (${c.area}) 후기 ${mix.n}건 중 ${Math.round(mix.trip * 100)}%`); }
    if (b.some((x) => x.key === "local")) local++;
    if (APPLY) {
      await sql`UPDATE cafes SET visitor_n=${mix.n}, visitor_trip=${mix.trip}, visitor_local=${mix.local} WHERE id=${c.id}`;
      wrote++;
    }
  }
  process.stdout.write(`\r  진행 ${seen}곳 · 🧳${trip} 🏠${local}${APPLY ? ` · 기록 ${wrote}` : ""}   `);
  if (LIMIT && seen >= LIMIT) break;
}
console.log(`\n\n${APPLY ? "✅ 적용" : "🔍 미리보기(쓰지 않음)"} — 대상 ${seen}곳`);
console.log(`  🧳 여행 배지 ${trip}곳 (${(trip / seen * 100).toFixed(1)}%)`);
console.log(`  🏠 동네 배지 ${local}곳 (${(local / seen * 100).toFixed(1)}%)`);
console.log("\n🧳 대상 표본:");
for (const s of samples) console.log("   " + s);
