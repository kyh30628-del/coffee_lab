#!/usr/bin/env node
// 🌙 Neon 활성시간 시간별 스냅샷 — "새벽에 진짜 잤나"를 증명하기 위한 계측기.
//   Neon의 시간별 소비 API는 Scale 요금제 전용이라 못 쓴다. 그래서 프로젝트 누계 카운터를
//   매시간 찍어 **차분**으로 시간당 활성분을 만든다.
// 💰 비용 0: Neon **관리 API**만 부른다. DB 접속 0·쿼리 0(즉 이 계측이 DB를 깨우지 않는다).
//   결과는 로컬 파일에 append. 실행: node scripts/neon-hourly-snapshot.mjs [--report]
import { readFileSync, appendFileSync, existsSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ""); }
const OUT = new URL("../../agent-reports/neon-hourly.ndjson", import.meta.url).pathname;

if (process.argv.includes("--report")) {
  if (!existsSync(OUT)) { console.log("아직 기록 없음"); process.exit(0); }
  const rows = readFileSync(OUT, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    .sort((a, b) => new Date(a.t) - new Date(b.t));

  // ⚠️ 2026-09-09 실측: Neon 누계 카운터는 매시간이 아니라 **2~3시간마다 몰아서** 갱신된다.
  //   그래서 시간당 차분은 0분/130분이 번갈아 나온다 — 시간 단위 수면시간은 만들 수 없다.
  //   구간(창) 단위로만 계산한다: 수면 = 창 길이 − 그 창의 활성 증가분.
  const kstOf = (iso) => new Date(new Date(iso).getTime() + 9 * 3600000);
  const near = (targetMs) => rows.reduce((best, r) =>
    Math.abs(new Date(r.t).getTime() - targetMs) < Math.abs(new Date(best.t).getTime() - targetMs) ? r : best, rows[0]);

  const win = (label, aMs, bMs) => {
    const a = near(aMs), b = near(bMs);
    const hours = (new Date(b.t) - new Date(a.t)) / 3600000;
    if (hours < 0.5) return console.log(`  ${label}: 기록 부족(구간 ${hours.toFixed(1)}h) — 판정 불가`);
    if (a.period !== b.period) return console.log(`  ${label}: 과금기간이 바뀌어 카운터가 리셋됨 — 판정 불가`);
    const act = (b.act - a.act) / 3600;
    const sleep = Math.max(0, hours - act);
    // 전송량은 2026-09-09 19시부터 기록했다 — 그 이전 기록과 비교하면 누계가 통째로 증가분으로 보인다.
    const gb = (a.xfer == null || b.xfer == null) ? null : (b.xfer - a.xfer) / 1e9;
    console.log(`  ${label}: ${kstOf(a.t).toISOString().slice(11,16)}~${kstOf(b.t).toISOString().slice(11,16)} (${hours.toFixed(1)}h)`);
    console.log(`     활성 ${act.toFixed(2)}h · 수면 ${sleep.toFixed(2)}h (${(sleep/hours*100).toFixed(0)}%) ${gb == null ? " · 전송 (기록 전)" : ` · 전송 ${gb.toFixed(2)}GB`}`);
  };

  // 어제·오늘 새벽(00~08 KST) — 기준선은 2026-09-09 시점 "190시간 중 1.1시간(0.6%)"
  const nowKst = kstOf(new Date().toISOString());
  const dayStartUtc = (daysAgo) => {
    const d = new Date(nowKst); d.setUTCDate(d.getUTCDate() - daysAgo); d.setUTCHours(0, 0, 0, 0);
    return d.getTime() - 9 * 3600000;
  };
  console.log("🌙 새벽 수면 (기준선: 2026-09-09 실측 190h 중 1.1h = 0.6%)");
  win("오늘 새벽", dayStartUtc(0), dayStartUtc(0) + 8 * 3600000);
  win("어제 새벽", dayStartUtc(1), dayStartUtc(1) + 8 * 3600000);
  console.log("\n📊 전체 구간");
  win("기록 전체", new Date(rows[0].t).getTime(), new Date(rows[rows.length - 1].t).getTime());
  console.log(`\n  (기록 ${rows.length}건 · 카운터가 2~3시간마다 갱신되므로 시간 단위가 아니라 구간 단위로만 읽는다)`);
  process.exit(0);
}

const K = process.env.NEON_API_KEY;
if (!K) { console.error("NEON_API_KEY 없음"); process.exit(1); }
const r = await fetch("https://console.neon.tech/api/v2/projects/damp-dew-22096939", {
  headers: { Authorization: `Bearer ${K}`, Accept: "application/json" }, signal: AbortSignal.timeout(15000),
});
const p = (await r.json()).project ?? {};
appendFileSync(OUT, JSON.stringify({
  t: new Date().toISOString(),
  act: p.active_time_seconds ?? 0,
  cu: p.compute_time_seconds ?? 0,
  xfer: p.data_transfer_bytes ?? 0,   // 🔎 2026-09-09: 전송량도 시간별로 갈라야 범인이 잡힌다
  period: p.consumption_period_start ?? null,
}) + "\n");
console.log(`기록: 활성누계 ${((p.active_time_seconds ?? 0) / 3600).toFixed(1)}h · 컴퓨트 ${((p.compute_time_seconds ?? 0) / 3600).toFixed(1)} CU-h · 전송누계 ${((p.data_transfer_bytes ?? 0)/1e9).toFixed(2)}GB`);
