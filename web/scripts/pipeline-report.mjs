// 🪜 파이프라인 적체 보고 — 단계별 '남은 일'과 **추세**를 본다. (2026-10-18 신설)
//
// 왜: 실측(최근 7일 run_ledger) 계량을 남긴 잡 **42종 중 '남은 일'을 보고하는 건 2종**뿐이었다.
//   '남은 일'이 없으면 "할 일이 없어서 0건"과 "막혀서 0건"을 구분할 수 없다 —
//   2026-10-04~15에 조직이 하루 1건으로 떨어져도 12일간 경보가 0건이었던 구조적 원인이다.
//   단계 정의는 `lib/pipelineStages.ts`(단일 출처)에 있고, 여기서는 **적체와 추세만** 보고한다.
//
// 판정: 적체가 **줄지 않으면** 그 단계가 막힌 것이다. 순환 단계(cyclic)는 0이 목표가 아니라
//   '한 바퀴가 도는지'가 기준이므로 증가만 본다.
//
// 💰 비용: 단계별 COUNT 7회(작은 컬럼·blob 미접촉) + 스냅샷 7행 INSERT. 하루 1회. Vercel 함수 0(로컬).
// 사용: node --import tsx scripts/pipeline-report.mjs
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { pipelineBacklog } = await import("../lib/pipelineStages.ts");
const sql = neon(process.env.DATABASE_URL);
const n = (v) => Number(v ?? 0).toLocaleString();

// 추세를 보려면 이력이 필요하다. 하루 1회 7행이라 부하는 무시 가능(run_ledger와 같은 lazy ensure 패턴).
await sql`CREATE TABLE IF NOT EXISTS pipeline_backlog (
  day DATE NOT NULL, stage TEXT NOT NULL, n INT NOT NULL,
  PRIMARY KEY (day, stage))`;

const rows = await pipelineBacklog();
// ⚠️ 날짜는 **DB에서 문자열로** 받는다. JS Date로 받아 toISOString()을 쓰면 KST 날짜가 UTC로 되돌아
//   하루 밀린다(실측: 10-18인데 머리글이 2026-10-17로 찍혔다). 표시와 저장이 어긋나면 안 된다.
const todayRow = (await sql`SELECT (now() AT TIME ZONE 'Asia/Seoul')::date d,
  to_char((now() AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') ymd`)[0];
const today = todayRow.d, ymd = todayRow.ymd;

// 🔴 2026-10-18 — **오늘 스냅샷은 비교에서 뺀다.** 안 빼면 같은 날 두 번 돌릴 때
//   "방금 자기가 쓴 값"과 비교해 전 단계가 "변화 없음 → 🔴"로 뜬다(실제로 그렇게 났다).
//   거짓 빨강은 진짜 문제를 묻는다(CEO 규칙). 비교 가능한 과거가 없으면 판정하지 않는다.
const hist = await sql`SELECT stage, n, day FROM pipeline_backlog
  WHERE day >= (now() AT TIME ZONE 'Asia/Seoul')::date - 7
    AND day <  (now() AT TIME ZONE 'Asia/Seoul')::date
  ORDER BY day ASC`;
const first = new Map();
for (const h of hist) if (!first.has(h.stage)) first.set(h.stage, h);

console.log(`🪜 파이프라인 적체 — ${ymd} (단계 정의: lib/pipelineStages.ts)`);
let stuck = 0, grew = 0;
for (const r of rows) {
  const prev = first.get(r.id);
  let trend = "기준선 없음(내일부터 판정)";
  if (prev) {
    const d = r.backlog - Number(prev.n);
    // 경과일 — 둘 다 DATE라 UTC 자정끼리 비교되므로 시간대 밀림이 없다(둘 다 같은 방식으로 받음).
    const days = Math.max(1, Math.round((new Date(today).getTime() - new Date(prev.day).getTime()) / 864e5));
    if (d > 0) { trend = `▲ +${n(d)} (${days}일)`; if (!r.cyclic) grew++; else grew++; }
    else if (d < 0) trend = `▼ ${n(d)} (${days}일)`;
    else { trend = `= 변화 없음 (${days}일)`; if (r.backlog > 0) stuck++; }
  }
  const flag = prev && r.backlog > 0 && r.backlog === Number(prev.n) ? "🔴" : prev && r.backlog > Number(prev.n) ? "⚠️" : "  ";
  console.log(`${flag} ${r.id.padEnd(14)} ${String(n(r.backlog)).padStart(8)}곳 ${r.cyclic ? "(순환)" : "      "}  ${trend.padEnd(24)} ${r.owner}`);
}
await sql`INSERT INTO pipeline_backlog (day, stage, n)
  SELECT ${today}::date, s.stage, s.n FROM (SELECT * FROM unnest(
    ${rows.map((r) => r.id)}::text[], ${rows.map((r) => r.backlog)}::int[]) AS t(stage, n)) s
  ON CONFLICT (day, stage) DO UPDATE SET n = EXCLUDED.n`;

if (stuck) console.log(`\n🔴 적체가 전혀 줄지 않은 단계 ${stuck}개 — 그 단계를 전진시키는 잡이 막혔다는 뜻이다.`);
else if (grew) console.log(`\n⚠️ 적체가 늘어난 단계 ${grew}개 — 유입이 처리량을 앞선다(막힘은 아님).`);
else console.log(`\n✅ 모든 단계의 적체가 줄거나 유지 — 파이프라인이 전진하고 있다.`);
console.log(`   ⚠️ 각 단계의 적체 정의는 **그 단계를 전진시키는 잡의 큐 정의와 같아야 한다**(짝). 잡의 큐를 바꾸면 여기도 바꾼다.`);
