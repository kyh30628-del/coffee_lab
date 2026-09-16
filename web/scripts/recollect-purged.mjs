// 🔁 파기 재수집 워커 — 90일 파기로 원본을 잃은 **공개 카페**의 후기를 다시 모은다.
//
//   왜 이게 필요한가(2026-09-16 실측):
//     raw_reviews는 약관 준수로 90일에 파기된다(cron-resynth). 코드 주석은 "warmup(00:10)이 필요 시
//     새로 수집"이라 적혀 있는데 **그 warmup이 어디에도 없다** — vercel 크론에도, launchd에도, 라우트로도.
//     파기만 돌고 재수집은 없는 채로 운영돼 왔다: 하루 파기 604곳 vs 재수집 24곳(25배 격차).
//     원본이 없으면 cron-resynth 선정조건(raw_reviews IS NOT NULL)에 안 걸려
//     **규칙이 바뀌어도 영영 재검이 안 된다.** 광고 오염 규칙도 그 카페엔 안 퍼진다.
//
//   왜 cron-resynth 안이 아니라 별도 로컬 잡인가:
//     resynth는 maxDuration 300초인데 전수적용에만 이미 62~214초를 쓴다. 거기에 수십 곳 재수집을 얹으면
//     타임아웃으로 죽고, 죽으면 recordRun에 도달 못 해 **기록조차 안 남는다**(오늘 아침 고친 그 사고).
//     로컬은 시간 제한이 없고 Vercel 함수 비용도 0이다.
//
//   CEO 승인 범위(B안): **검증 등급 우선**. 참고 등급은 여력 있을 때만(RECOLLECT_ALL=1).
//   예산: 자기 몫 NAVER_RECOLLECT_RESERVE(1,500콜/일) 안에서만. 폐업 예약은 안 건드린다.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { synthAndStore } = await import("../lib/synthStore.ts");
const { sql } = await import("../lib/db.ts");
const { recollectMayUse, naverUsedToday, NAVER_DAILY_QUOTA, NAVER_RECOLLECT_RESERVE } = await import("../lib/naverBudget.ts");

// 하루 목표. 실측 카페당 8콜(최초 추정 6콜은 틀렸다 — 3곳에 24콜).
// 예약 2,300콜 ÷ 8 = 하루 약 287곳 > 정상 파기분 246곳/일 → 여유 41곳으로 백로그를 갉아 7일 내 소진.
const MAX = Number(process.env.RECOLLECT_MAX || 280);
const ALL_GRADES = process.env.RECOLLECT_ALL === "1";        // 참고 등급까지(A안) — 기본 꺼짐
const TOTAL_MS = Number(process.env.RECOLLECT_TOTAL_MS || 90 * 60_000);
const t0 = Date.now();
const startUsed = await naverUsedToday();

const rows = await sql`SELECT id, name, area, synth_grade FROM cafes
  WHERE published = true AND raw_reviews IS NULL
    AND (${ALL_GRADES} OR synth_grade = '검증')
  ORDER BY (synth_grade = '검증') DESC, synth_checked_at ASC NULLS FIRST
  LIMIT ${MAX}`;
console.log(`파기 재수집 — 대상 ${rows.length}곳(${ALL_GRADES ? "전 등급" : "검증 등급만"}) · 예약 ${(NAVER_DAILY_QUOTA - startUsed).toLocaleString()}콜 여유 · 상한 ${Math.round(TOTAL_MS / 60000)}분`);

let done = 0, err = 0, stop = "";
for (const c of rows) {
  if (Date.now() - t0 > TOTAL_MS) { stop = "시간 상한"; break; }
  // 🔒 자기 몫만 쓴다 — '남은 쿼터'로 판단하면 발굴(cron-grow) 예약분까지 먹는다.
  //   이번 실행에서 쓴 콜을 직접 세어 예약분(1,500)에서 멈춘다. 초과 지출 구조적 차단.
  const spent = (await naverUsedToday()) - startUsed;
  if (spent >= NAVER_RECOLLECT_RESERVE) { stop = `자기 예약분 소진(${spent.toLocaleString()}/${NAVER_RECOLLECT_RESERVE.toLocaleString()}콜)`; break; }
  const g = await recollectMayUse();
  if (!g.ok) { stop = `네이버 한도/차단(잔여 ${g.remaining.toLocaleString()})`; break; }
  try { await synthAndStore({ id: c.id, name: c.name, area: c.area }, { refresh: true }); done++; }
  catch (e) { err++; if (err <= 3) console.log(`  오류 ${c.name}: ${String(e).slice(0, 70)}`); }
  if (done % 25 === 0 && done) console.log(`  … ${done}곳 완료`);
}
const used = (await naverUsedToday()) - startUsed;
// 실제로 원본이 돌아왔는지 확인 — '실행했다'가 아니라 '효과가 났다'로 본다(하네스 3원칙).
const [chk] = await sql`SELECT count(*)::int n FROM cafes WHERE published AND raw_reviews IS NULL AND synth_grade='검증'`;
console.log(`재수집 ${done}곳 · 오류 ${err} · 네이버 ${used.toLocaleString()}콜 사용${stop ? ` · 중단(${stop})` : ""}`);
console.log(`남은 '검증' 등급 재검불가: ${chk.n.toLocaleString()}곳`);
