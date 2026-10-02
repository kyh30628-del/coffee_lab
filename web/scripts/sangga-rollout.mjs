// 🏪 소상공인시장진흥공단 「상가업소정보」 수도권 롤아웃 (2026-10-02 CEO 승인).
//   인허가 원장(import-permits.mjs)과는 완전히 다른 공공데이터 — 업종 소분류 '커피/카페/다방' 기준이라
//   원장(휴게음식점·제과점영업·일반음식점)이 못 잡는 카페를 추가로 찾는다(강남구 실측: 1,871후보→실통과 53곳,
//   강동구 369→2곳, 강북구 표본 36→0곳 — 지역별 편차 큼, 전체 추정은 금지하고 실측만 쓴다).
//   순서: ①discoverSangga로 적재(data.go.kr, 프랜차이즈는 공용목록 discover.ts#isFranchise로 즉시 차단)
//        ②이번 회차 신규분만 식별 ③실제 수집+합성까지 돌려 진짜 통과수(live+pending) 실측.
//   "적재=통과"로 보고하지 않는다(09-30 사고 재발방지) — 반드시 synthAndStore까지 실행한 뒤의 숫자만 보고.
//   진행상황은 agent-reports/sangga-rollout-progress.json에 누적(지역 66개 중 완료분 기록) — 매일 이어받기.
//   수도권 66개 지역(METRO_SIGNGU)을 전부 돌면 자연히 '남은 지역 0개'로 매일 공짜로 종료된다(자동 정지 불필요).
//
// 사용: node --import tsx scripts/sangga-rollout.mjs [--budget N]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ""); }

const { discoverSangga, METRO_SIGNGU } = await import("../lib/sangga.ts");
const { sql } = await import("../lib/db.ts");
const { synthAndStore } = await import("../lib/synthStore.ts");
const { isFranchise } = await import("../lib/discover.ts");
const { naverUsedToday, naverBlocked, NAVER_DAILY_QUOTA } = await import("../lib/naverBudget.ts");

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
// 💰 다른 일일 크론(원장 적재·수집·폐업확인·발굴) 몫을 남긴다 — 이 잡 혼자 하루를 다 먹지 않는다.
//   실측(10-02): 지역당 수백~1천여 콜. 10,000콜이면 하루 5~10개 지역 정도 안전하게 처리.
const BUDGET = arg("budget", 10000);
const RESERVE = NAVER_DAILY_QUOTA - BUDGET; // 이 선 넘으면 중단

const PROGRESS_FILE = new URL("../agent-reports/sangga-rollout-progress.json", import.meta.url);
const progress = existsSync(PROGRESS_FILE) ? JSON.parse(readFileSync(PROGRESS_FILE, "utf8")) : { done: [], results: {} };
const regions = METRO_SIGNGU.filter(r => !progress.done.includes(r.code));

console.log(`남은 지역 ${regions.length}개(전체 ${METRO_SIGNGU.length}) · 시작 쿼터 ${await naverUsedToday()}/${NAVER_DAILY_QUOTA} · 예산 ${BUDGET}`);

// 🩹 쿼터 소진으로 전날 중간에 멈춘 지역의 잔여분(검증 안 끝난 pipeline_status='new')을 먼저 정리한다.
//   지역별 target은 '이번 회차 created_at'로만 잡아서, done에 안 넣은 미완료 지역을 다시 돌려도
//   새로 적재되는 행이 없으면(이미 존재) target이 비어 잔여분이 영영 검증을 못 받는다 — 지역 무관하게
//   source='sangga' + pipeline_status='new' 전부를 먼저 쓸어 담아 정합성을 보장한다.
const leftover = await sql`SELECT id, name, area FROM cafes WHERE source='sangga' AND pipeline_status='new'`;
if (leftover.length) {
  console.log(`\n=== 잔여분 정리(미완료 지역의 검증 안 된 행) ${leftover.length}곳 ===`);
  const target0 = leftover.filter(r => !isFranchise(r.name));
  let pending0 = 0, live0 = 0, done0 = 0;
  for (const c of target0) {
    if (await naverBlocked()) break;
    if ((await naverUsedToday()) >= NAVER_DAILY_QUOTA - RESERVE) break;
    try {
      await synthAndStore({ id: c.id, name: c.name, area: c.area }, {});
      const [after] = await sql`SELECT pipeline_status FROM cafes WHERE id=${c.id}`;
      if (after.pipeline_status === "pending") pending0++; else if (after.pipeline_status === "live") live0++;
      done0++;
    } catch { /* 개별 실패는 건너뛴다 */ }
  }
  console.log(`  잔여분 처리 ${done0}곳 · 공개유력 ${live0 + pending0}곳`);
}

if (regions.length === 0) { console.log("전 지역 완료 — 할 일 없음(정상 종료)"); process.exit(0); }

for (const region of regions) {
  const used = await naverUsedToday();
  if (used >= NAVER_DAILY_QUOTA - RESERVE) { console.log(`\n예산(${BUDGET}콜) 도달 — 오늘은 여기까지. 누적 완료 ${progress.done.length}/${METRO_SIGNGU.length}개`); break; }
  if (await naverBlocked()) { console.log("\n쿼터 소진 감지 — 중단"); break; }

  console.log(`\n=== [${region.areaLabel}] 시작 (쿼터 ${used}/${NAVER_DAILY_QUOTA}) ===`);
  const beforeInsert = new Date();
  const disc = await discoverSangga(region.code, region.areaLabel, { apply: true, maxPages: 70 });
  console.log(`  적재: 후보 ${disc.cafes} · 신규 ${disc.inserted} · 중복제외 ${disc.skipped}`);

  const newIds = await sql`SELECT id, name, area FROM cafes WHERE source='sangga' AND created_at >= ${beforeInsert}`;
  const target = newIds.filter(r => !isFranchise(r.name));
  console.log(`  검증 대상(이번 회차분, 프랜차이즈 재확인 제외) ${target.length}곳`);

  let pending = 0, live = 0, rejected = 0, held = 0, noise = 0, done = 0;
  for (const c of target) {
    if (await naverBlocked()) break;
    const u = await naverUsedToday();
    if (u >= NAVER_DAILY_QUOTA - RESERVE) break;
    try {
      await synthAndStore({ id: c.id, name: c.name, area: c.area }, {});
      const [after] = await sql`SELECT pipeline_status FROM cafes WHERE id=${c.id}`;
      if (after.pipeline_status === "pending") pending++;
      else if (after.pipeline_status === "live") live++;
      else if (after.pipeline_status === "rejected") rejected++;
      else if (after.pipeline_status === "held") held++;
      else if (after.pipeline_status === "noise") noise++;
      done++;
    } catch { /* 개별 실패는 건너뛴다(다음 카페로) */ }
  }
  console.log(`  검증 결과: 처리 ${done} · live+pending(공개유력) ${live + pending} · rejected ${rejected} · held ${held} · noise ${noise}`);

  progress.done.push(region.code);
  progress.results[region.code] = { area: region.areaLabel, inserted: disc.inserted, verified: done, passed: live + pending, at: new Date().toISOString() };
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

const totalPassed = Object.values(progress.results).reduce((a, r) => a + (r.passed || 0), 0);
const totalInserted = Object.values(progress.results).reduce((a, r) => a + (r.inserted || 0), 0);
console.log(`\n=== 누적 === 지역 ${progress.done.length}/${METRO_SIGNGU.length}개 · 적재 ${totalInserted}곳 · 실측 통과(공개유력) ${totalPassed}곳`);
