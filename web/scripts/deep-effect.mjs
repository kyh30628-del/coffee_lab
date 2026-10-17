// 📊 깊은 수집의 **효과 검증** — 북극성(사람 유입)으로 판정한다. (2026-10-17 신설)
//
// 왜 필요한가: 10-17에 1,674곳을 처리해 검증 후기 +115,533건을 확보했다. 그런데 그게
//   **사람 유입을 늘리는지는 아직 가설**이다(후기가 많아지면 색인 품질이 올라 유입이 는다).
//   작업만 하고 효과 검증을 걸지 않으면 "했다"로 끝나고, 틀린 방향에 쿼터를 계속 태운다.
//   하네스 3원칙: **실행이 아니라 효과가 성공**이다.
//
// 설계 — 대조군이 공짜로 생겼다:
//   처리군 = deep_log에 있는 카페(깊은 수집 완료)
//   대조군 = 같은 선정 기준(60일 사람 조회·공개·원본 보유)인데 아직 미처리인 카페
//   둘은 **같은 모집단에서 조회수 순으로 갈렸을 뿐**이라 비교가 성립한다.
//   ⚠️ 처리군이 조회수 상위라 원래부터 유입이 많다 → **절대값이 아니라 처리 전후 증감률**로 본다.
//
// 판정: 처리 후 7일 유입 증가율이 대조군 증가율보다 유의하게 높아야 "효과 있음".
//   미달이면 깊은 수집은 품질 자산일 뿐 유입 레버가 아니라고 확정하고 쿼터를 다른 데 쓴다.
//
// 💰 집계 쿼리 2개(traffic_events는 idx_traffic_events_ts 사용, 작은 컬럼만). 로컬 실행 = Vercel 0.
// 사용: node --import tsx scripts/deep-effect.mjs [--days=7]
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const DAYS = Number(arg("days", 7));

// 처리군·대조군의 '처리 시각 기준 전/후' 사람 조회수
const r = await sql`
  WITH treated AS (
    SELECT d.cafe_id id, d.at
    FROM deep_log d JOIN cafes c ON c.id = d.cafe_id
    WHERE c.published AND d.raw_after > d.raw_before      -- 실제로 원본이 늘어난 곳만
  ), control AS (
    -- 같은 선정 기준인데 아직 미처리 — 처리군의 중앙 처리시각을 가상 기준점으로 쓴다
    SELECT c.id, (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY at) FROM deep_log) at
    FROM cafes c
    JOIN (SELECT DISTINCT NULLIF(substring(path from '^/c/([0-9]+)'), '')::bigint vid
          FROM traffic_events
          WHERE ts > now() - interval '60 days' AND path ~ '^/c/[0-9]+'
            AND anon_id NOT IN (SELECT anon_id FROM bot_anon_cache)) v ON v.vid = c.id
    LEFT JOIN deep_log d ON d.cafe_id = c.id
    WHERE c.published AND c.raw_reviews IS NOT NULL AND d.cafe_id IS NULL
  ), hits AS (
    SELECT NULLIF(substring(path from '^/c/([0-9]+)'), '')::bigint id, ts
    FROM traffic_events
    WHERE ts > now() - make_interval(days => ${DAYS * 2 + 2})
      AND path ~ '^/c/[0-9]+' AND anon_id NOT IN (SELECT anon_id FROM bot_anon_cache)
  )
  SELECT '처리군' grp, count(DISTINCT t.id)::int cafes,
         count(*) FILTER (WHERE h.ts >= t.at)::int after_pv,
         count(*) FILTER (WHERE h.ts < t.at AND h.ts >= t.at - make_interval(days => ${DAYS}))::int before_pv
  FROM treated t LEFT JOIN hits h ON h.id = t.id
  UNION ALL
  SELECT '대조군', count(DISTINCT c.id)::int,
         count(*) FILTER (WHERE h.ts >= c.at)::int,
         count(*) FILTER (WHERE h.ts < c.at AND h.ts >= c.at - make_interval(days => ${DAYS}))::int
  FROM control c LEFT JOIN hits h ON h.id = c.id`;

// 🛡️ 2026-10-18 **조기 판정 금지 가드**(내가 하루 만에 "역효과"로 오판했다).
//   첫 실행(10-18 08:20)이 순효과 -23.9%p로 "🔴 역효과 — 즉시 중단"을 찍었다. 검산하니 전부 노이즈였다:
//     · 처리군의 '후' 노출이 평균 15시간(485곳은 1시간)인데 '전'은 7일이다 — 길이가 다르다.
//     · 시간당으로 정규화하니 -207%p가 나왔다. 대조군이 시간당 3.17→9.38로 3배가 됐기 때문인데,
//       특정 카페 쏠림은 없었다(상위 3~4회). 전체 상세조회가 10-14 155회 → 10-17 439회로 **2.8배** 흔들린다.
//     · 아침 스윕 보고 자체가 "요일편차 2.3배 — 일별 판정 안 함"이라고 적어둔 그 변동이다.
//   → '후' 구간이 '전' 구간(7일)만큼 쌓이기 전에는 **판정하지 않는다.** 숫자는 보여주되 등급을 매기지 않는다.
//   하네스 규약과 같다: 측정 전 결론 금지 · 프록시 지표는 '주의'까지만.
const refAt = await sql`SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY at) t FROM deep_log`;
const afterH = refAt[0]?.t ? (Date.now() - new Date(refAt[0].t).getTime()) / 3.6e6 : 0;
const MIN_AFTER_H = Number(process.env.DEEP_EFFECT_MIN_H || DAYS * 24);
const canJudge = afterH >= MIN_AFTER_H;

console.log(`📊 깊은 수집 효과 검증 — 처리 전후 ${DAYS}일 사람 조회 비교 (${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ")} KST)`);
const pct = (b, a) => (b > 0 ? `${a >= b ? "+" : ""}${(((a - b) / b) * 100).toFixed(1)}%` : a > 0 ? "신규" : "0%");
let t = null, c = null;
for (const x of r) {
  console.log(`  ${x.grp}  카페 ${Number(x.cafes).toLocaleString()}곳 · 전 ${Number(x.before_pv).toLocaleString()}회 → 후 ${Number(x.after_pv).toLocaleString()}회  (${pct(Number(x.before_pv), Number(x.after_pv))})`);
  if (x.grp === "처리군") t = x; else c = x;
}
if (t && c && Number(t.before_pv) > 0 && Number(c.before_pv) > 0) {
  const tg = (Number(t.after_pv) - Number(t.before_pv)) / Number(t.before_pv);
  const cg = (Number(c.after_pv) - Number(c.before_pv)) / Number(c.before_pv);
  const lift = (tg - cg) * 100;
  console.log(`\n  순효과(처리군 증가율 − 대조군 증가율) = ${lift >= 0 ? "+" : ""}${lift.toFixed(1)}%p`);
  if (!canJudge) {
    console.log(`  ⏳ **판정 보류** — '후' 구간이 ${afterH.toFixed(1)}시간뿐이다(필요 ${MIN_AFTER_H}시간 = '전' 구간과 동일).`);
    console.log(`     전체 상세조회가 요일에 따라 2.8배까지 흔들려(10-14 155회 ↔ 10-17 439회) 지금 수치는 노이즈다.`);
    console.log(`     ${(MIN_AFTER_H - afterH).toFixed(0)}시간 뒤부터 판정한다 — 그 전엔 숫자만 본다.`);
  } else {
    console.log(lift >= 10 ? "  ✅ 효과 있음 — 유입 레버로 인정, 남은 대상 계속 처리."
      : lift <= -10 ? "  🔴 역효과 — 즉시 중단하고 원인 조사."
      : "  ⚠️ 판정 보류 — 차이가 ±10%p 안이다. 효과가 없다는 뜻이다.");
  }
} else console.log("\n  표본 부족 — 처리 후 기간이 더 필요하다.");
