// 🌱 로컬 발굴 워커 — 지역을 골라 깊게 훑는다. (2026-08-25 개편)
//
// 왜 로컬인가(실측): 발굴 병목은 **네이버 API 한도가 아니라 Vercel 함수 시간**이었다.
//   · 쿼터는 18,700/25,000(75%) 사용, 여유 6,300/일 — 남아돈다.
//   · 그런데 cron-grow는 하루 4회 × 225초 = **하루 15분**만 발굴한다(maxDuration 300s 상한).
//   맥에서 돌리면 함수 시간 제약이 없고 Vercel 과금도 0이다(자율 조직 launchd와 같은 방식).
//   실제로 로컬 실행 한 번에 1,984곳이 들어온 날이 있었다 — 크론 하루치의 60배.
//
// ⚠️ 속도 제한은 여기가 아니라 discoverRegion 안에 있다(호출 간 220ms + 429 두 종류 구분 + naver_budget 가드).
//   그래서 이 스크립트는 지연을 따로 넣지 않는다 — 이중으로 넣으면 느려지기만 한다.
//
// 사용:
//   node --import tsx scripts/grow-all.mjs                 # 전 지역
//   node --import tsx scripts/grow-all.mjs --filter=강원     # 강원만
//   node --import tsx scripts/grow-all.mjs --budget=4000    # 네이버 호출 4,000건까지만 쓰고 중단
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { discoverRegion, METRO_REGIONS } = await import("../lib/discover.ts");
const { naverUsedToday, naverBlocked } = await import("../lib/naverBudget.ts");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const FILTER = arg("filter", "");
// 쿼터 상한: 하루 25,000 중 크론 몫을 남겨둔다. 기본 5,000 = 현재 여유(6,300)보다 보수적.
const BUDGET = Number(arg("budget", 5000));

// ⚠️ 순서는 METRO_REGIONS 배열 순이 아니라 **가장 오래 안 훑은 지역 먼저**(cron-grow와 같은 원칙).
//   그냥 배열 순으로 돌면 중단 후 재실행할 때마다 앞쪽 지역만 반복해 예산을 태운다(2026-08-25 실제로 밟음).
const pool = METRO_REGIONS.filter((r) => !FILTER || r.region.includes(FILTER));
let order = new Map();
try {
  const st = await sql`SELECT region, last_run FROM discovery_state`;
  for (const x of st) order.set(x.region, x.last_run ? new Date(x.last_run).getTime() : 0);
} catch {}
const targets = pool.sort((a, b) => (order.get(a.region) ?? 0) - (order.get(b.region) ?? 0));
const startUsed = await naverUsedToday();
console.log(`대상 ${targets.length}개 지역${FILTER ? ` (필터: ${FILTER})` : ""} · 시작 시점 쿼터 사용 ${startUsed}/25000 · 이번 실행 예산 ${BUDGET}콜\n`);

let totalNew = 0, totalFound = 0, done = 0, stoppedBy = "";
for (const r of targets) {
  // 쿼터 안전판 — 예산 소진이나 실제 429 차단이면 즉시 멈춘다(크론 몫까지 태우지 않기 위해).
  const used = await naverUsedToday();
  if (used - startUsed >= BUDGET) { stoppedBy = `예산 소진(${used - startUsed}콜)`; break; }
  if (await naverBlocked()) { stoppedBy = "네이버 429 차단 상태"; break; }

  try {
    const res = await discoverRegion(r.region, r.areaLabel);
    totalNew += res.inserted; totalFound += res.found ?? 0; done++;
    // 발굴 이력 기록 — 이게 없으면 cron-grow가 방금 훑은 지역을 또 훑고, 이 스크립트도 재실행 때 앞부터 반복한다.
    await sql`INSERT INTO discovery_state (region, area_label, last_run) VALUES (${r.region}, ${r.areaLabel}, now())
      ON CONFLICT (region) DO UPDATE SET last_run = now()`.catch(() => {});
    console.log(`  ${String(r.areaLabel).padEnd(12)} 발견 ${String(res.found ?? 0).padStart(4)} · 신규 ${String(res.inserted).padStart(4)} · 누적신규 ${totalNew}`);
  } catch (e) {
    console.log(`  ${String(r.areaLabel).padEnd(12)} 오류 ${String(e).slice(0, 60)}`);
  }
}
const endUsed = await naverUsedToday();
console.log(`\n=== 발굴 완료 — 지역 ${done}/${targets.length}${stoppedBy ? ` (중단: ${stoppedBy})` : ""} ===`);
console.log(`  신규 ${totalNew}곳 (발견 ${totalFound}건 중) · 네이버 호출 ${endUsed - startUsed}건 · 오늘 누계 ${endUsed}/25000`);
console.log(`  신규는 전부 미공개 상태다 — 후기 수집·합성·등급 판정을 통과해야 공개된다.`);
