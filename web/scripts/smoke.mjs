#!/usr/bin/env node
// 🔥 배포 전 연기(smoke) 테스트 — **빌드한 새 코드를 실제로 띄워서** 소비자 화면을 열어본다.
//
// 왜 이게 필요한가(2026-08-30 장애):
//   그날 SELECT에 없는 컬럼을 넣고 배포해 **공개 카페 전체가 404**가 됐다(2시간 26분).
//   빌드는 통과했다 — 타입도 맞고 문법도 맞았기 때문이다. 깨진 건 **런타임에 DB를 만났을 때**다.
//   그러니 "빌드 통과"는 배포 자격이 아니다. **띄워서 열어봐야** 안다.
//
// 왜 프로덕션 확인이 아니라 로컬인가:
//   프로덕션을 확인하는 건 **이미 배포한 뒤**다. 사용자가 먼저 장애를 본다.
//   이 검사는 배포 전에 새 코드를 로컬에서 띄워 같은 페이지를 열어본다 — 사용자보다 먼저 본다.
//
// 검사 대상 = 소비자가 실제로 오는 곳(실측 유입 기준):
//   지역×취향 84% · 카페 상세 15% · 홈 · 지도 API. 하나라도 200이 아니면 배포 중단.
//
// 사용: node --import tsx scripts/smoke.mjs   (npm run ship이 자동 호출)

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

const PORT = 3199; // 개발 서버(3100)와 겹치지 않게
const BASE = `http://127.0.0.1:${PORT}`;

// 실제 존재하는 대상을 DB에서 뽑는다 — 하드코딩한 id가 비공개가 되면 검사가 거짓 실패한다.
const [cafe] = (await sql`SELECT id FROM cafes WHERE published ORDER BY synth_count DESC NULLS LAST LIMIT 1`);
const [area] = (await sql`SELECT area FROM cafes WHERE published AND area IS NOT NULL
  GROUP BY area ORDER BY count(*) DESC LIMIT 1`);
if (!cafe || !area) { console.error("🔴 smoke: 검사 대상을 못 찾음(DB 확인 필요)"); process.exit(1); }

const TARGETS = [
  { path: "/", label: "홈" },
  { path: `/c/${cafe.id}`, label: "카페 상세" },                       // ← 2026-08-30 장애 지점
  { path: `/area/${encodeURIComponent(area.area)}/work`, label: "지역×취향" }, // 유입 84%
  { path: `/area/${encodeURIComponent(area.area)}`, label: "지역" },
  { path: "/api/cafes", label: "지도 데이터" },
  { path: "/new", label: "신상" },
];

console.log(`🔥 smoke: 새 코드를 :${PORT}에 띄워 소비자 화면 ${TARGETS.length}개 확인`);

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  cwd: new URL("..", import.meta.url).pathname,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });

const cleanup = () => { try { server.kill("SIGTERM"); } catch {} };
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

// 기동 대기(최대 60초)
const t0 = Date.now();
let up = false;
while (Date.now() - t0 < 60_000) {
  try { const r = await fetch(BASE, { signal: AbortSignal.timeout(3000) }); if (r.status) { up = true; break; } }
  catch { await new Promise((r) => setTimeout(r, 1000)); }
}
if (!up) {
  console.error("🔴 smoke: 서버가 60초 안에 안 떴다 — 배포 중단");
  console.error(serverLog.slice(-800));
  cleanup(); process.exit(1);
}

let failed = 0;
for (const t of TARGETS) {
  let status = 0, size = 0, err = "";
  try {
    const r = await fetch(BASE + t.path, { signal: AbortSignal.timeout(45_000) });
    status = r.status;
    size = (await r.text()).length;
  } catch (e) { err = String(e).slice(0, 60); }
  const ok = status === 200 && size > 2000; // 200이어도 껍데기면 실패로 본다
  if (!ok) failed++;
  console.log(`  ${ok ? "✅" : "🔴"} ${t.label.padEnd(10)} ${t.path.slice(0, 40).padEnd(42)} ${status || err} ${size ? size + "B" : ""}`);
}

cleanup();

if (failed) {
  console.error(`\n🔴 배포 중단 — 소비자 화면 ${failed}개가 정상이 아니다.`);
  console.error("   빌드가 통과해도 런타임에 깨질 수 있다(2026-08-30: 없는 컬럼 참조 → 카페 전체 404).");
  console.error("   서버 로그 마지막 부분:");
  console.error(serverLog.slice(-1200));
  process.exit(1);
}
console.log("\n✅ smoke 통과 — 소비자 화면 전부 정상");
