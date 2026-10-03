#!/usr/bin/env node
// 💳 Neon 실청구 지표 스냅샷(2026-09-14, 2026-10-03 부동산 DB 추가) — 로컬에서 하루 1회 받아 DB에 남긴다.
//   왜 로컬인가: NEON_API_KEY는 로컬 .env.local에만 있고 Vercel 환경변수엔 없다(09-14 실측: cron-costwatch의
//   실청구 표기가 비어 나옴). 키를 가진 로컬이 숫자만 DB에 넣고 cron-costwatch는 그 숫자를 읽는다.
//   시크릿이 Vercel로 안 나가고 이력도 남는다(추세 비교 가능).
//   🔴 2026-10-03 — 네온 청구서(Marketplace: Neon)가 카페(coffee-db)+부동산(budongsan-db) 2개 DB를 합쳐
//   한 장으로 나오는데, 이 스크립트는 그동안 카페 DB만 기록해서 "청구서 안 뜨면 부동산 몫을 영영 못 구하는"
//   공백이 있었다(10-03 CEO 질문으로 발견). 같은 NEON_API_KEY(조직 단위)로 두 프로젝트를 다 찍는다.
//   비용: 외부 API 2회 + 작은 INSERT 2행/일.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const key = process.env.NEON_API_KEY;
if (!key) { console.error("NEON_API_KEY 없음"); process.exit(1); }

await sql`CREATE TABLE IF NOT EXISTS neon_billing (
  id BIGSERIAL PRIMARY KEY, project TEXT NOT NULL DEFAULT 'coffee-db', period_start TIMESTAMPTZ, egress_gb REAL, compute_h REAL, days REAL,
  egress_per_day REAL, compute_per_day REAL, taken_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`ALTER TABLE neon_billing ADD COLUMN IF NOT EXISTS project TEXT NOT NULL DEFAULT 'coffee-db'`;
await sql`CREATE INDEX IF NOT EXISTS idx_neon_billing_taken ON neon_billing (taken_at DESC)`;
await sql`CREATE INDEX IF NOT EXISTS idx_neon_billing_project_taken ON neon_billing (project, taken_at DESC)`;

const PROJECTS = [
  { id: "damp-dew-22096939", name: "coffee-db" },
  { id: "tiny-lab-22447905", name: "budongsan-db" },
];

const lines = [];
for (const proj of PROJECTS) {
  const r = await fetch(`https://console.neon.tech/api/v2/projects/${proj.id}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  if (!r.ok) { console.error(`Neon API(${proj.name})`, r.status); continue; }
  const p = (await r.json())?.project;
  const egressGb = (p?.data_transfer_bytes ?? 0) / 1e9;
  const computeH = (p?.compute_time_seconds ?? 0) / 3600;
  const start = p?.consumption_period_start ?? null;
  const days = start ? Math.max(0.5, (Date.now() - new Date(start).getTime()) / 86400000) : 1;
  await sql`INSERT INTO neon_billing (project, period_start, egress_gb, compute_h, days, egress_per_day, compute_per_day)
    VALUES (${proj.name}, ${start}, ${egressGb}, ${computeH}, ${days}, ${egressGb / days}, ${computeH / days})`;
  lines.push(`${proj.name}: 전송 ${egressGb.toFixed(1)}GB(${(egressGb / days).toFixed(1)}/일·무료500GB의${Math.round(egressGb / 5)}%) · 컴퓨트 ${computeH.toFixed(1)}CU-h(${(computeH / days).toFixed(1)}/일) · ${days.toFixed(1)}일차`);
}
await sql`DELETE FROM neon_billing WHERE taken_at < now() - interval '180 days'`;
console.log(`✅ ${lines.join(" | ")}`);
