// 🧵 후기 수집·합성 샤드 워커 — 여러 프로세스로 나눠 돌려 CPU를 다 쓴다. (2026-08-25)
//
// 왜 필요한가(실측): 단일 프로세스는 5곳/분이었다. 병목은 네이버 API가 아니라 **합성 CPU**다
//   (카페당 네이버 8콜 = 약 1.6초인데 실제로는 12초 걸렸다). 맥 코어를 나눠 쓰면 배수로 빨라진다.
//
// 💰 과금: 후기 출처는 네이버 블로그/카페글(무료)뿐이다. 구글 Places는 ENABLE_GOOGLE_PLACES 미설정으로
//   꺼져 있어 호출 0(과금 0). 네이버는 API별로 한도가 따로라 발굴(local)과 수집(blog/cafearticle)은
//   서로 잡아먹지 않는다 — 이걸 하나로 착각해 수집을 멈췄던 적이 있다.
//
// 사용: node --import tsx scripts/collect-shard.mjs --shard=0 --of=4 --filter=강원
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { synthAndStore } = await import("../lib/synthStore.ts");
const sql = neon(process.env.DATABASE_URL);

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const SHARD = Number(arg("shard", 0)), OF = Number(arg("of", 1));
const FILTER = arg("filter", "");
const label = `[${SHARD}/${OF}]`;

let done = 0, err = 0, consecErr = 0;
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
  console.log(`${label} ${done}곳 처리`);
}
