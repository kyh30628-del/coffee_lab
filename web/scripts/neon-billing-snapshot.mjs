#!/usr/bin/env node
// 💳 Neon 실청구 지표 스냅샷(2026-09-14) — 로컬에서 하루 1회 받아 DB에 남긴다.
//   왜 로컬인가: NEON_API_KEY는 로컬 .env.local에만 있고 Vercel 환경변수엔 없다(09-14 실측: cron-costwatch의
//   실청구 표기가 비어 나옴). 키를 배포 환경에 퍼뜨리는 대신, 키를 가진 로컬이 숫자만 DB에 넣고
//   cron-costwatch는 그 숫자를 읽는다. 시크릿이 Vercel로 안 나가고 이력도 남는다(추세 비교 가능).
//   비용: 외부 API 1회 + 작은 INSERT 1행/일.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const key = process.env.NEON_API_KEY;
if (!key) { console.error("NEON_API_KEY 없음"); process.exit(1); }
const r = await fetch("https://console.neon.tech/api/v2/projects/damp-dew-22096939", { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
if (!r.ok) { console.error("Neon API", r.status); process.exit(1); }
const p = (await r.json())?.project;
const egressGb = (p?.data_transfer_bytes ?? 0) / 1e9;
const computeH = (p?.compute_time_seconds ?? 0) / 3600;
const start = p?.consumption_period_start ?? null;
const days = start ? Math.max(0.5, (Date.now() - new Date(start).getTime()) / 86400000) : 1;
await sql`CREATE TABLE IF NOT EXISTS neon_billing (
  id BIGSERIAL PRIMARY KEY, period_start TIMESTAMPTZ, egress_gb REAL, compute_h REAL, days REAL,
  egress_per_day REAL, compute_per_day REAL, taken_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE INDEX IF NOT EXISTS idx_neon_billing_taken ON neon_billing (taken_at DESC)`;
await sql`INSERT INTO neon_billing (period_start, egress_gb, compute_h, days, egress_per_day, compute_per_day)
  VALUES (${start}, ${egressGb}, ${computeH}, ${days}, ${egressGb / days}, ${computeH / days})`;
await sql`DELETE FROM neon_billing WHERE taken_at < now() - interval '180 days'`;
console.log(`✅ 전송 ${egressGb.toFixed(1)}GB(${(egressGb / days).toFixed(1)}/일·무료 500GB의 ${Math.round(egressGb / 5)}%) · 컴퓨트 ${computeH.toFixed(1)}CU-h(${(computeH / days).toFixed(1)}/일) · ${days.toFixed(1)}일차`);
