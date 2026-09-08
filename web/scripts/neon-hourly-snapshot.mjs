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
  const rows = readFileSync(OUT, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  console.log("KST 시각        활성분/시간  판정");
  let slept = 0;
  for (let i = 1; i < rows.length; i++) {
    const dt = (new Date(rows[i].t) - new Date(rows[i - 1].t)) / 60000;
    if (dt < 30 || dt > 90) continue;                      // 한 시간 간격이 아닌 구간은 버린다
    const act = (rows[i].act - rows[i - 1].act) / 60;      // 분
    if (rows[i].period !== rows[i - 1].period) continue;   // 과금기간이 바뀌면 카운터가 리셋된다
    const kst = new Date(new Date(rows[i].t).getTime() + 9 * 3600000);
    const hh = kst.getUTCHours();
    const sleepMin = Math.max(0, dt - act);
    if (hh <= 7) slept += sleepMin;
    console.log(`${hh <= 7 ? "🌙" : "  "} ${kst.toISOString().slice(5, 16).replace("T", " ")}  ${act.toFixed(1).padStart(6)}분   잠 ${sleepMin.toFixed(1)}분`);
  }
  console.log(`\n▶ 기록 구간의 새벽(00~07시) 총 수면: ${(slept / 60).toFixed(2)}시간`);
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
  period: p.consumption_period_start ?? null,
}) + "\n");
console.log(`기록: 활성누계 ${((p.active_time_seconds ?? 0) / 3600).toFixed(1)}h · 컴퓨트 ${((p.compute_time_seconds ?? 0) / 3600).toFixed(1)} CU-h`);
