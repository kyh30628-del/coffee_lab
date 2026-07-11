// 발굴 스윕(매일) — 신선도 순환(가장 오래 안 훑은 지역 먼저) + 지역당 시간상한 + 총 예산 + 네이버 429 중단.
//   cron-grow(2h/1지역=각 지역 5.5일에 1회)만으론 롱테일 독립카페(예: 카페 희와)가 며칠씩 누락 → 이 워커가
//   매일 밤 다수 지역을 '공정 순환'으로 발굴해 네이버 search/local 한도를 최대 활용(CEO 지시 2026-07-09).
//   ⚠️ 지역당 deadline 필수 — 없으면 한 지역을 완전소진(25분·수천콜)해 뒷 지역이 매일 누락. deadline으로 넓게 커버.
//   신규는 pipeline_status='new'(비공개)로 적재 → cron-grow/synth가 수집·합성·게이트 후에만 공개(안전).
//   env: PER_REGION_MS(지역당 상한), TOTAL_MS(총 예산), SWEEP_SIDO(예: '서울'—특정 시도만).
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { discoverRegion } = await import("../lib/discover.ts");
const { mineArea } = await import("../lib/reviewMiner.ts"); // 리뷰 속 상호 추출→네이버검증 신규적재(키워드검색 못 잡는 롱테일)
const { sql } = await import("../lib/db.ts");
const { sweepMayContinue, naverUsedToday, NAVER_DAILY_QUOTA, NAVER_SWEEP_RESERVE } = await import("../lib/naverBudget.ts"); // 스윕은 70%까지만·30%는 cron-grow용 예약
const MINE_CALLS = Number(process.env.MINE_CALLS || 30); // 지역당 리뷰마이닝 네이버 검증 콜(0이면 마이닝 생략)

const PER_REGION_MS = Number(process.env.PER_REGION_MS || 120_000); // 지역당 상한(넓게 커버 — cron-grow는 225s)
const TOTAL_MS = Number(process.env.TOTAL_MS || 6 * 60 * 60_000);   // 총 예산 상한(6h) — 보통 '한 바퀴 완주'로 먼저 종료
const sido = (process.env.SWEEP_SIDO || "").trim();                 // 특정 시도만(비우면 전체 66지역)
const t0 = Date.now();
const runStart = new Date(t0).toISOString();                        // 이번 회차 시작 — 전 지역 한 바퀴 돌면 종료(무한 재순회 방지)
let totalNew = 0, done = 0, stop = "";
console.log(`발굴 스윕 — 신선도순 순환 · 지역당 ${PER_REGION_MS / 1000}s · 상한 ${Math.round(TOTAL_MS / 60000)}분(한 바퀴 완주 시 조기종료)${sido ? ` · ${sido}` : ""}`);

while (Date.now() - t0 < TOTAL_MS && !stop) {
  // 🧭 네이버 예산 가드 — 오늘 사용량이 (25k − 예약분)에 닿으면 스윕 정지. 남은 예약분(기본 30%)은
  //   하루 종일 도는 cron-grow(2h)가 쓴다. "70%만 쓰고 멈춘다"를 실제로 강제(2026-07-10 사기꾼 소리 들은 그 지점).
  const bud = await sweepMayContinue();
  if (!bud.ok) {
    stop = bud.blocked
      ? `네이버 실측 한도(429) — 스윕 정지(${bud.used.toLocaleString()}/${NAVER_DAILY_QUOTA.toLocaleString()} 사용, 쿨다운 후 자동 재개). 정상.`
      : `네이버 예약분 도달 — 스윕 정지(${bud.used.toLocaleString()}/${NAVER_DAILY_QUOTA.toLocaleString()} 사용 · cron-grow용 ${NAVER_SWEEP_RESERVE.toLocaleString()} 예약). 정상.`;
    break;
  }
  const reg = (await sql`SELECT region, area_label, last_run FROM discovery_state
    WHERE (${sido} = '' OR region LIKE ${sido + '%'})
    ORDER BY last_run ASC NULLS FIRST LIMIT 1`)[0];
  if (!reg) { stop = "대상 지역 없음"; break; }
  if (reg.last_run && new Date(reg.last_run).toISOString() >= runStart) { stop = "전 지역 한 바퀴 완주"; break; } // 가장 오래된 지역도 이번 회차에 이미 발굴됨 = 모두 커버
  const budget = Math.min(PER_REGION_MS, TOTAL_MS - (Date.now() - t0));
  try {
    const res = await discoverRegion(reg.region, reg.area_label ?? reg.region, undefined, { deadlineMs: Date.now() + budget, sorts: ["comment", "random"] });
    await sql`UPDATE discovery_state SET last_run=now(), last_found=${res.found}, last_inserted=${res.inserted} WHERE region=${reg.region}`;
    totalNew += res.inserted; done++;
    // 🔎 리뷰마이닝 — 이 지역 리뷰에서 상호 추출→네이버검증→롱테일 신규적재(키워드검색 사각). 콜 바운드.
    let mined = 0;
    if (MINE_CALLS > 0 && !res.apiError) {
      try { const mr = await mineArea(reg.area_label ?? reg.region, { maxCalls: MINE_CALLS, apply: true }); mined = mr?.inserted ?? 0; totalNew += mined; }
      catch { /* 마이닝 실패는 무시(발굴은 이미 완료) */ }
    }
    console.log(`[${done}] ${reg.region}: 발견 ${res.found} · 신규 ${res.inserted}${mined ? ` +마이닝 ${mined}` : ""} · 누적신규 ${totalNew}`);
    if (res.apiError) stop = "네이버 한도 추정(429) — 중단(다음 회차 신선도순 재개)";
  } catch (e) {
    const m = String(e).slice(0, 80);
    console.log(`${reg.region}: 오류 — ${m}`);
    await sql`UPDATE discovery_state SET last_run=now() WHERE region=${reg.region}`.catch(() => {}); // 무한 재시도 방지(다음 지역으로)
    if (/quota|429|exceed|한도/i.test(m)) stop = "네이버 한도 — 중단";
  }
}
const usedFinal = await naverUsedToday().catch(() => 0);
console.log(`스윕 종료(${stop || "예산 소진"}) — 처리 ${done}개 지역 · 신규 ${totalNew}곳 적재 · 네이버 ${usedFinal.toLocaleString()}/${NAVER_DAILY_QUOTA.toLocaleString()}(${Math.round(usedFinal / NAVER_DAILY_QUOTA * 100)}%) 사용. cron-grow/synth가 수집·합성·게이트 후 공개.`);
process.exit(0);
