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

// 🎯 2026-09-17(CEO 승인) — 대상을 "'검증' 등급 전체"에서 **"사람이 실제로 연 카페"**로 좁힌다.
//   왜: 첫 자동 실행 실측이 내 추정을 4배 뒤엎었다 — 카페당 **33콜**(결재 때 6콜, 스모크 8콜이라 보고했다).
//     '검증' 11,553곳을 지키려면 하루 246곳 × 33콜 = 8,118콜 = **쿼터의 32%**. 발굴을 3분의 1로 줄여야 한다.
//     게다가 파기가 재수집보다 4배 빨라(22:01 회차 파기 281 vs 재수집 70) 격차가 매일 벌어진다.
//   실측: 공개 27,626곳 중 **최근 90일 사람이 연 카페는 4,114곳(14.9%)뿐**이다.
//     아무도 안 여는 카페의 원본을 지키느라 쿼터를 태우고 있었다.
//     4,114곳이면 하루 70곳으로 **59일에 한 바퀴** — 90일 파기 주기 안에 든다. 따라잡을 수 있다.
//   ⚠️ 굶기지 않는다: 열람분이 떨어지면 '검증' 등급, 그다음 오래된 순으로 자연히 내려간다(ORDER BY 3단).
//   💰 비용: traffic_events는 33,717행·5.8MB에 ts 인덱스가 있다. 실행당 1회 226ms — 무시할 수준.
const { BOT_ANON_IDS_SQL } = await import("../lib/behaviorBot.ts");
const viewed = await sql.query(
  `SELECT DISTINCT substring(path from '^/c/([0-9]+)')::int AS id FROM traffic_events
   WHERE ts >= now() - interval '90 days' AND path LIKE '/c/%'
     AND anon_id NOT IN (${BOT_ANON_IDS_SQL})`);
const viewedIds = viewed.map((r) => r.id).filter(Number.isInteger);
console.log(`  최근 90일 열람된 카페 ${viewedIds.length.toLocaleString()}곳 — 이들을 먼저 지킨다`);

const rows = await sql`SELECT id, name, area, synth_grade FROM cafes
  WHERE published = true AND raw_reviews IS NULL
    AND (${ALL_GRADES} OR synth_grade = '검증' OR id = ANY(${viewedIds}))
  ORDER BY (id = ANY(${viewedIds})) DESC,          -- ① 사람이 실제로 연 카페
           (synth_grade = '검증') DESC,             -- ② 그다음 검증 등급
           synth_checked_at ASC NULLS FIRST         -- ③ 오래된 순
  LIMIT ${MAX}`;
const pri = rows.filter((c) => viewedIds.includes(Number(c.id))).length;
console.log(`파기 재수집 — 대상 ${rows.length}곳(${ALL_GRADES ? "전 등급" : "열람분 우선 + 검증 등급"}) · 그중 열람분 ${pri}곳 · 예약 ${(NAVER_DAILY_QUOTA - startUsed).toLocaleString()}콜 여유 · 상한 ${Math.round(TOTAL_MS / 60000)}분`);

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
const [chk] = await sql`SELECT count(*)::int n FROM cafes WHERE published AND raw_reviews IS NULL AND id = ANY(${viewedIds})`;
console.log(`재수집 ${done}곳 · 오류 ${err} · 네이버 ${used.toLocaleString()}콜 사용${stop ? ` · 중단(${stop})` : ""}`);
console.log(`남은 **열람된 카페** 재검불가: ${chk.n.toLocaleString()}곳  ← 이게 진짜 지켜야 할 수`);
