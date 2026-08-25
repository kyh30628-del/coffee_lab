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
const { naverBlocked } = await import("../lib/naverBudget.ts");
const sql = neon(process.env.DATABASE_URL);

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const SHARD = Number(arg("shard", 0)), OF = Number(arg("of", 1));
const FILTER = arg("filter", "");
const label = `[${SHARD}/${OF}]`;

let done = 0, err = 0, consecErr = 0, stale = 0;
for (;;) {
  // 샤드끼리 같은 행을 집지 않게 id % OF로 나눈다(락 없이 충돌 회피).
  const rows = FILTER
    ? await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NULL AND pipeline_status='new'
        AND address LIKE ${FILTER + "%"} AND (id % ${OF}) = ${SHARD} ORDER BY id LIMIT 20`
    : await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NULL AND pipeline_status='new'
        AND (id % ${OF}) = ${SHARD} ORDER BY id LIMIT 20`;
  if (!rows.length) { console.log(`${label} 큐 소진 — 완료 ${done}곳`); break; }
  for (const c of rows) {
    try { await synthAndStore(c, { refresh: false }); done++; consecErr = 0; }
    catch (e) { err++; consecErr++; if (err <= 3) console.log(`${label} ✗ ${c.name}: ${String(e).slice(0, 50)}`); }
    if (consecErr >= 10) { console.log(`${label} 연속 오류 10회 — 중단(재실행시 재개)`); process.exit(0); }
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
