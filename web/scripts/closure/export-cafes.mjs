#!/usr/bin/env node
// ☕ 매칭용 카페 목록 1회 내보내기 — Neon을 한 번만 깨우고 끝낸다(비용 규율).
//   실행: node scripts/closure/export-cafes.mjs
//   산출: ~/coffee-platform/agent-reports/permits/cafes.ndjson
//
// 🔴 비용 계산(착수 전 필수, [[feedback_no_cost_increase_ever]]):
//   - 쿼리 1회, 읽는 컬럼 7개(id·name·address·area·dong·lat·lng·published) — 큰 컬럼(synth_reviews/raw_reviews) 미접촉.
//   - 행수 약 23,000 × 약 120B = 약 2.8MB. 반복 조회 없음(파일로 떨어뜨려 이후 전부 로컬에서 사용).
//   - 매칭·검증은 전부 로컬 파일로 하므로 이 스크립트 외에는 DB를 건드리지 않는다.
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

const env = readFileSync(path.join(homedir(), "coffee-platform/web/.env.local"), "utf8");
const DB = (env.match(/^DATABASE_URL=(.+)$/m) || [])[1]?.trim().replace(/^['"]|['"]$/g, "");
if (!DB) { console.error("DATABASE_URL 없음"); process.exit(1); }

const { neon } = await import("@neondatabase/serverless");
const sql = neon(DB);

const OUT_DIR = path.join(homedir(), "coffee-platform/agent-reports/permits");
mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, "cafes.ndjson");

const rows = await sql`
  SELECT id, name, address, area, dong, lat, lng, published,
         -- 🔎 2026-09-10: 폐업 매칭 기각 규칙용. 배열 전체가 아니라 **최댓값 하나만** 가져온다(전송 최소).
         --    저장 형식이 "2025.03.07"이라 문자열 최대 = 최신 날짜다.
         (SELECT max(d) FROM jsonb_array_elements_text(COALESCE(review_dates,'[]'::jsonb)) d) AS last_review
  FROM cafes
  WHERE address IS NOT NULL AND address <> ''
`;
writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
const pub = rows.filter((r) => r.published).length;
console.log(`✅ ${rows.length.toLocaleString()}곳(공개 ${pub.toLocaleString()}) → ${OUT}`);
