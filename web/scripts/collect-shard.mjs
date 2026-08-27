// 🧵 후기 수집·합성 샤드 워커 — 여러 프로세스로 나눠 돌려 CPU를 다 쓴다. (2026-08-25)
//
// 왜 필요한가(실측): 단일 프로세스는 5곳/분이었다. 병목은 네이버 API가 아니라 **합성 CPU**다
//   (카페당 네이버 8콜 = 약 1.6초인데 실제로는 12초 걸렸다). 맥 코어를 나눠 쓰면 배수로 빨라진다.
//
// 💰 과금: 후기 출처는 네이버 블로그/카페글(무료)뿐이다. 구글 Places는 ENABLE_GOOGLE_PLACES 미설정으로
//   꺼져 있어 호출 0(과금 0).
// 🚨 네이버 일일 한도 25,000은 **애플리케이션 전체 공유**다(local/blog/cafearticle 합산).
//   API별로 따로인 줄 알고 6샤드를 돌렸다가 하루치를 태웠다 — 실측 `{count/quota=25000/25000}`.
//   그래서 샤드 수는 보수적으로(기본 3 이하), 그리고 아래 소진 감지로 즉시 멈춘다.
//
// 사용: node --import tsx scripts/collect-shard.mjs --shard=0 --of=4 --filter=강원
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { synthAndStore } = await import("../lib/synthStore.ts");
const { naverBlocked, naverUsedToday, NAVER_DAILY_QUOTA } = await import("../lib/naverBudget.ts");
const sql = neon(process.env.DATABASE_URL);

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const SHARD = Number(arg("shard", 0)), OF = Number(arg("of", 1));
const FILTER = arg("filter", "");
const label = `[${SHARD}/${OF}]`;

let done = 0, err = 0, consecErr = 0, stale = 0, batches = 0, baselineUsed = 0;
const CALL_PER_CAFE_STOP = Number(process.env.CALL_PER_CAFE_STOP || 15); // 정상 ~5콜의 3배
const CRON_RESERVE = Number(process.env.COLLECT_CRON_RESERVE || 2000); // 평판점검·폐업확인 크론 몫
// ⏰ 창(window) 데드라인 — 정지 조건에 '시간'이 없어 120분 창이 지켜지지 않던 것을 막는다(2026-08-27).
//   원인: catchup.sh는 라운드와 라운드 *사이*에서만 시각을 보는데, 샤드가 큐를 다 비울 때까지 자체적으로
//   돌아 한 라운드가 4시간을 넘겼다. 큐가 작을 땐 안 드러나다가 적체 2,346곳이 들어오며 터졌다.
//   ⚠️ env가 없어도 스스로 상한을 갖는다 — catchup.sh를 안 거치고 직접 실행해도 무한히 돌지 않게.
//   창을 넘겨 중단해도 손실 0: 큐 조건이 raw_reviews IS NULL이라 다음 창이 그 자리에서 이어간다.
const DEADLINE_MS = Number(process.env.COLLECT_DEADLINE) > 0
  ? Number(process.env.COLLECT_DEADLINE) * 1000          // catchup.sh가 넘긴 epoch초(창 종료 시각)
  : Date.now() + Number(process.env.COLLECT_MAX_MIN || 120) * 60 * 1000; // 폴백: 시작 +120분
const overDeadline = () => Date.now() >= DEADLINE_MS;
const deadlineLabel = () => new Date(DEADLINE_MS).toLocaleTimeString("ko-KR", { hour12: false });
for (;;) {
  // 창 종료면 새 배치를 아예 집지 않는다(DB 조회 1회도 아낀다).
  if (overDeadline()) { console.log(`${label} ⏰ 창 종료(${deadlineLabel()}) — 중단. 확보 ${done}곳 · 다음 창에서 이어감`); break; }
  // 샤드끼리 같은 행을 집지 않게 id % OF로 나눈다(락 없이 충돌 회피).
  // 🥇 처리 순서 = 강원 먼저, 수도권 적체는 그다음(CEO 지시 2026-08-25).
  //   강원은 지금 공개가 140곳뿐이라 한 곳이 늘 때 사용자 체감이 크고, 수도권은 이미 13,494곳이 공개돼 있어
  //   적체가 며칠 늦어져도 화면이 비지 않는다. ORDER BY로만 우선순위를 주고 큐는 하나로 유지한다
  //   (큐를 나누면 강원이 끝난 뒤 워커가 놀거나, 필터를 지우는 걸 잊어 수도권이 영영 안 도는 사고가 난다).
  const rows = FILTER
    // 🔒 이중 안전판(2026-08-26): 방금 확인한 카페는 다시 집지 않는다. raw_reviews가 NULL로 남는
    //   경로가 하나라도 생기면 같은 카페를 무한 재수집하며 쿼터를 태운다(실제로 그랬다).
    ? await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NULL AND pipeline_status='new'
        AND (raw_checked_at IS NULL OR raw_checked_at < now() - interval '12 hours')
        AND address LIKE ${FILTER + "%"} AND (id % ${OF}) = ${SHARD} ORDER BY id LIMIT 20`
    : await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NULL AND pipeline_status='new'
        AND (raw_checked_at IS NULL OR raw_checked_at < now() - interval '12 hours')
        AND (id % ${OF}) = ${SHARD}
        ORDER BY (address LIKE '강원%') DESC, id LIMIT 20`;
  if (!rows.length) { console.log(`${label} 큐 소진 — 완료 ${done}곳`); break; }
  for (const c of rows) {
    // 배치(20곳)가 도는 중에도 창을 넘기면 즉시 멈춘다 — 배치 단위로만 보면 최대 2분을 초과한다.
    if (overDeadline()) { console.log(`${label} ⏰ 창 종료(${deadlineLabel()}) — 배치 중단. 확보 ${done}곳`); break; }
    try { await synthAndStore(c, { refresh: false }); done++; consecErr = 0; }
    catch (e) { err++; consecErr++; if (err <= 3) console.log(`${label} ✗ ${c.name}: ${String(e).slice(0, 50)}`); }
    if (consecErr >= 10) { console.log(`${label} 연속 오류 10회 — 중단(재실행시 재개)`); process.exit(0); }
  }
  // 🚨 효율 자동 차단(2026-08-26) — **낭비를 사람이 발견하기 전에 워커가 스스로 멈춘다.**
  //   오늘 두 번 태웠다: ①중복 샤드 4개(곳당 43콜) ②수집 0건 카페 무한 재선택(곳당 133콜).
  //   둘 다 "돌긴 도는데 수확이 없는" 형태라 겉으론 정상으로 보이고, 쿼터를 다 태운 뒤에야 드러난다.
  //   정상은 곳당 5콜 안팎이므로 그 3배(15콜)를 넘으면 무조건 이상이다 — 즉시 멈추고 사람이 본다.
  const used = await naverUsedToday().catch(() => 0);
  if (batches === 0) baselineUsed = used;
  batches++;

  // 🚦 크론 몫 예약(2026-08-26 CEO 지시) — 수집이 하루 25,000을 통째로 먹으면
  //   cron-enrich(평판 점검)·cron-closure(폐업 확인)가 쿼터 없이 헛돈다.
  //   폐업 확인이 밀리면 **이미 닫은 카페가 지도에 남아 소비자가 헛걸음한다** — 수집보다 우선순위가 높다.
  //   실제로 오늘 25,000을 다 태워 20시 크론 두 개를 굶겼다.
  if (used >= NAVER_DAILY_QUOTA - CRON_RESERVE) {
    console.log(`${label} 🚦 크론 예약분 도달 — 수집 중단(${used}/${NAVER_DAILY_QUOTA}, 크론용 ${CRON_RESERVE} 보존)`);
    break;
  }
  const spent = used - baselineUsed;
  if (done >= 20 && spent / Math.max(1, done) > CALL_PER_CAFE_STOP) {
    console.log(`${label} 🚨 효율 이상 — 곳당 ${(spent / done).toFixed(1)}콜(정상 ~5, 한계 ${CALL_PER_CAFE_STOP}). 낭비 방지로 중단.`);
    break;
  }

  // 🚨 헛돌기 차단(2026-08-25 실제로 밟음): 쿼터가 소진되면 gatherRaw가 빈 결과를 반환하고
  //   raw_reviews를 쓰지 않는다 → 상태가 'new'로 남아 **같은 20행이 영원히 다시 뽑힌다**.
  //   샤드가 "1,900곳 처리"를 찍는데 실제 확보는 205곳이었던 게 이것. 진척으로 판정한다.
  const after = (await sql`SELECT count(*)::int c FROM cafes WHERE id = ANY(${rows.map((r) => r.id)}) AND raw_reviews IS NOT NULL`)[0].c;
  if (after === 0) {
    stale++;
    if (stale >= 2 || await naverBlocked()) { console.log(`${label} 진척 없음(쿼터 소진 추정) — 중단. 확보 ${done}곳`); break; }
  } else stale = 0;
  console.log(`${label} ${done}곳 시도 · 이번 배치 확보 ${after}/${rows.length}`);
}
