// 🔭 효과 판정이 **실제로 원장에 기록되는지** 한 번 확인한다. (2026-10-18)
//
// 왜: 그 전까지 `run_ledger.effect_ok`는 30일 2,372건 **전부 NULL**이었다 — 하네스 1원칙
//   ("실행이 아니라 효과가 성공")이 한 번도 계산되지 않았다. 배선을 고쳤으니 **고쳐졌다는 증거**가 필요하다.
//   선언만 고치고 작동을 안 보면 같은 빈껍데기가 반복된다.
//
// 판정: monotone-decrease를 선언한 잡의 런에 effect_ok가 붙기 시작하면 성공.
//   붙지 않으면 (a) 그 잡이 아직 안 돌았거나 (b) 계량(remain)을 안 내보내는 것이다 — 둘을 구분해 보여준다.
// 💰 비용: 집계 쿼리 2개(작은 컬럼). 로컬 실행 → Vercel 0.
// 사용: node --import tsx scripts/effect-watch.mjs
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { getContract, ALL_CONTRACT_IDS } = await import("../lib/jobContract.ts");
const sql = neon(process.env.DATABASE_URL);

// ⚠️ **배선이 배포된 시점 이후의 런만** 본다 — 그 전 런은 판정 코드가 없었으니 NULL이 당연하다.
//   이 구분이 없으면 "계량은 있는데 판정이 안 붙었다"는 거짓 경보가 난다(실제로 한 번 났다).
//   기본값은 배선 배포 시각(커밋 5c6b2597, 2026-10-18 15:03 KST = 06:03 UTC). 필요하면 --since=ISO로 덮어쓴다.
const SINCE = (process.argv.find((a) => a.startsWith("--since=")) ?? "").split("=")[1] || "2026-10-18T06:03:00Z";
const declared = ALL_CONTRACT_IDS.filter((j) => getContract(j).effect?.kind === "monotone-decrease");
const rows = await sql`SELECT job, effect_ok, metrics, started_at FROM run_ledger
  WHERE job = ANY(${declared}) AND started_at > ${SINCE}::timestamptz
  ORDER BY started_at DESC`;

console.log(`🔭 효과 판정 확인 — 선언 ${declared.length}종(${declared.join(", ")})`);
console.log(`   기준: 배선 배포 ${SINCE} 이후 ${rows.length}런 (그 전 런은 판정 코드가 없어 NULL이 정상)`);
let judged = 0;
for (const j of declared) {
  const rs = rows.filter((r) => r.job === j);
  const withVerdict = rs.filter((r) => r.effect_ok !== null);
  const hasRemain = rs.filter((r) => Number.isFinite(Number((r.metrics ?? {}).remain)));
  judged += withVerdict.length;
  const why = rs.length === 0 ? "배포 이후 아직 안 돌았다(스케줄 대기)"
    : hasRemain.length === 0 ? "계량(remain) 미보고 → 판정 불가(정직한 NULL)"
    : withVerdict.length === 0 ? "🔴 계량은 있는데 판정이 안 붙었다 — 배선 확인 필요"
    : `판정 ${withVerdict.length}건(효과없음 ${rs.filter((r) => r.effect_ok === false).length})`;
  console.log(`  ${j.padEnd(18)} 런 ${String(rs.length).padStart(3)} · ${why}`);
}
console.log(judged > 0
  ? `✅ 효과 판정이 기록되고 있다(48시간 ${judged}건) — 1원칙이 실제로 돈다.`
  : `⏳ 아직 판정 0건. 위 사유를 보고 (안 돌았다 / 계량 없다 / 배선 문제)를 가릴 것.`);
