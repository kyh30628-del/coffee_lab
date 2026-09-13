#!/usr/bin/env node
// 🧱 1회 집행 마이그레이션(2026-09-13 비용사고) — 관리자 노이즈 집계용 생성열.
//   왜: `synth_quality->>'raw'`를 39,806행에 계산하면 JSONB(TOAST) 디토스트로 1회 2.1GB·2.9초가 든다.
//       관리자 화면이 하루 540회 불러 58.0GB/일. 값은 정수 둘뿐이다.
//   무엇: 생성열(STORED) 2개 + 인덱스. Postgres가 쓰기마다 자동 계산 → 드리프트 0, 쓰기경로 수정 0.
//   주의: 테이블을 재작성한다(실측 약 6분). 크론이 멈춘 창에서 돌릴 것.
//   실행: node scripts/migrations/2026-09-13-sq-cols.mjs
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const run = async (label, q) => { const t = Date.now(); await sql.query(q); console.log(`✅ ${label} (${((Date.now() - t) / 1000).toFixed(0)}s)`); };
// 숫자가 아닌 값이 들어와도 실패하지 않게 숫자만 남겨 캐스팅한다(빈 문자열은 NULL).
await run("sq_raw", `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS sq_raw INT GENERATED ALWAYS AS (NULLIF(regexp_replace(COALESCE(synth_quality->>'raw',''), '[^0-9]', '', 'g'), '')::int) STORED`);
await run("sq_rejected", `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS sq_rejected INT GENERATED ALWAYS AS (NULLIF(regexp_replace(COALESCE(synth_quality->>'rejected',''), '[^0-9]', '', 'g'), '')::int) STORED`);
await run("인덱스", `CREATE INDEX IF NOT EXISTS idx_cafes_sq_cols ON cafes (sq_raw, sq_rejected) WHERE sq_raw IS NOT NULL`);
await run("VACUUM(ANALYZE) — 재작성 후 가시성맵 복구(이걸 안 하면 Index Only Scan이 안 걸린다)", `VACUUM (ANALYZE) cafes`);
const [a] = await sql`SELECT ROUND(AVG(sq_rejected::float / NULLIF(sq_raw::float,0))::numeric*100,1) pct, SUM(sq_raw)::bigint raw FROM cafes WHERE sq_raw IS NOT NULL`;
const [b] = await sql`SELECT ROUND(AVG((synth_quality->>'rejected')::float / NULLIF((synth_quality->>'raw')::float,0))::numeric*100,1) pct, SUM((synth_quality->>'raw')::int)::bigint raw FROM cafes WHERE synth_quality IS NOT NULL`;
console.log("값 대조 — 생성열:", JSON.stringify(a), " 기존:", JSON.stringify(b));
if (a.pct !== b.pct || String(a.raw) !== String(b.raw)) { console.error("🔴 값이 다르다 — 롤백 검토"); process.exit(1); }
console.log("✅ 값 동일");
