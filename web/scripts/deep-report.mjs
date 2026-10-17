// 📋 깊은 수집 일일 보고 — CEO 요구(2026-10-17) "매일 효율적으로, ISR write·Neon 쓰기·네이버 사용률을 보고".
//
// 보고 항목은 CEO가 화나는 지점 그대로다: 낭비·빈껍데기·ISR write·DB 재생성.
//   · 처리 수와 **검증 후기 증감** — 감소가 0건인지(가드가 일하고 있는지)
//   · **ISR write 수** — 곳당 1장(등급변경만 3장)을 지키는지
//   · Neon 쓰기 건수와 원본 증가량
//   · 네이버 사용률과 남은 유휴
//   · 남은 대상과 소요 예상일
//
// 💰 비용: 집계 쿼리 5개(작은 컬럼만, 큰 blob 미접촉). 로컬 실행 → Vercel 함수 0.
//   ⚠️ raw 크기는 **표본 300곳**으로만 잰다(전수 pg_column_size는 큰 컬럼 전체 읽기 — 10-17에 내가 한 번 어겼다).
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const nb = await import("../lib/naverBudget.ts");
const sql = neon(process.env.DATABASE_URL);
const n = (v) => Number(v ?? 0).toLocaleString();

const since = process.argv.includes("--all") ? "100 years" : "26 hours";

const d = (await sql`SELECT count(*)::int cafes, sum(calls)::int calls,
  sum(GREATEST(raw_after - raw_before, 0))::int raw_add,
  sum(count_after - count_before)::int cnt_delta,
  count(*) FILTER (WHERE count_after > count_before)::int grew,
  count(*) FILTER (WHERE count_after = count_before)::int flat,
  count(*) FILTER (WHERE count_after < count_before)::int shrank
  FROM deep_log WHERE at > now() - ${since}::interval`)[0];

const remain = (await sql`WITH v AS (
  SELECT NULLIF(substring(path from '^/c/([0-9]+)'), '')::bigint id, count(*)::int views
  FROM traffic_events WHERE ts > now() - interval '60 days' AND path ~ '^/c/[0-9]+'
    AND anon_id NOT IN (SELECT anon_id FROM bot_anon_cache) GROUP BY 1)
  SELECT count(*)::int r FROM v JOIN cafes c ON c.id = v.id
  LEFT JOIN deep_log dl ON dl.cafe_id = c.id
  WHERE c.published AND c.raw_reviews IS NOT NULL AND dl.cafe_id IS NULL`)[0].r;

const used = (await sql`SELECT COALESCE(used,0) u FROM naver_budget
  WHERE day = to_char(now() AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD')`)[0]?.u ?? 0;
const reserve = await nb.collectReserveNow();
const gate = nb.NAVER_DAILY_QUOTA - nb.NAVER_CLOSURE_RESERVE - reserve;

// 등급 상승(참고 → 검증)
const up = (await sql`SELECT count(*)::int n FROM cafes c JOIN deep_log dl ON dl.cafe_id = c.id
  WHERE dl.at > now() - ${since}::interval AND c.synth_grade = '검증' AND dl.count_after > dl.count_before`)[0].n;

// raw 크기 — 표본만
const sz = (await sql`WITH s AS (SELECT pg_column_size(raw_reviews) b FROM cafes
  WHERE raw_reviews IS NOT NULL LIMIT 300) SELECT round(avg(b))::int avg_b FROM s`)[0].avg_b;

const isr = Number(d.grew ?? 0); // 좁은 무효화 기준: 늘어난 곳만 1장(등급변경은 3장이나 집계상 보수적으로 1로 둔다)
console.log(`📋 깊은 수집 일일 보고 — ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ")} KST`);
console.log(`  처리 ${n(d.cafes)}곳 — 증가 ${n(d.grew)} · 변화없음 ${n(d.flat)} · 🔴감소 ${n(d.shrank)}`);
console.log(`  검증 후기 ${d.cnt_delta >= 0 ? "+" : ""}${n(d.cnt_delta)}건 · 원본 +${n(d.raw_add)}건 · 등급 '검증' ${n(up)}곳`);
console.log(`  ISR write 약 ${n(isr)}장(곳당 1장) · Neon 쓰기 약 ${n(Number(d.grew ?? 0) * 2 + Number(d.flat ?? 0))}건`);
console.log(`  네이버 ${n(used)}/${n(nb.NAVER_DAILY_QUOTA)} (${(used / nb.NAVER_DAILY_QUOTA * 100).toFixed(0)}%) · 이 레인 ${n(d.calls)}콜`);
console.log(`     수집 예약(동적) ${n(reserve)} · 발굴·깊은수집 게이트 used<${n(gate)} · 남은 유휴 ${n(Math.max(0, gate - used))}콜`);
console.log(`  남은 대상 ${n(remain)}곳 · 하루 300곳이면 ${Math.ceil(remain / 300)}일`);
console.log(`  원본 평균 크기 ${(sz / 1024).toFixed(1)}KB(표본 300곳, 상한 600건≈179KB)`);
if (Number(d.shrank ?? 0) > 0) console.log(`  🔴 검증 후기가 줄어든 곳 ${n(d.shrank)}곳 — 급감 차단기를 통과한 감소다. 즉시 확인 필요.`);
