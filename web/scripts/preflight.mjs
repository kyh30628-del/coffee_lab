#!/usr/bin/env node
// 🚦 배포 전 검사 — 2026-08-30 장애 재발방지.
//
// 그날 무슨 일이 있었나:
//   getCafe의 SELECT에 `c.area_rank, c.area_total`을 추가하면서 컬럼 생성은 cron-enrich(20:40)에
//   맡기고 배포를 먼저 냈다. 크론은 배포보다 늦게 돈다 — 당연한 걸 놓쳤다.
//   "column does not exist" → getCafe의 catch가 null 반환 → notFound() → **공개 카페 전체 404**.
//   ISR이 그 404를 캐시해 DB를 고쳐도 페이지가 계속 404였다(재배포로 해소).
//   노출 2시간 26분(14:53~17:19), 오후 한복판.
//
// 왜 코드 주석이 아니라 검사인가:
//   그날 나는 "오류를 삼키면 위험하다"고 하루 종일 말하면서 계수기까지 만들어놓고,
//   바로 그 패턴에 당했다. **사람의 주의력은 방어선이 아니다.** 기계가 막아야 한다.
//
// 무엇을 검사하나 — 오늘 사고의 정확한 유형만. 넓게 잡으면 오탐으로 무시하게 된다.
//   ① SQL의 `c.<컬럼>` / `cafes.<컬럼>` 참조가 실제 cafes 테이블에 있는가
//   ② (있으면) 빌드가 통과하는가 — 호출부에서 별도로 실행
//
// 사용: node --import tsx scripts/preflight.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

const ROOT = new URL("..", import.meta.url).pathname;
// 배포되는 코드만 본다 — 임시/실험 스크립트까지 잡으면 거짓 경보가 늘어 무시하게 된다.
const ROOTS = ["app", "lib"];
const SKIP = new Set(["node_modules", ".next", ".git", "public"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

// 실제 스키마
const cols = new Set(
  ((await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'cafes'`) )
    .map((r) => r.column_name),
);

// SQL 문자열 안에서만 본다 — TS 객체 접근(c.name 등)과 섞이지 않게 백틱 쿼리로 한정.
//   neon 태그드 템플릿은 sql`...` 형태라 백틱 안을 훑으면 된다.
const RE_QUERY = /sql(?:\.query)?\s*`([\s\S]*?)`/g;
const RE_COL = /\b(?:c|cafes)\.([a-z_][a-z_0-9]*)\b/g;
// 컬럼이 아닌 것(별칭·함수·예약어)이 걸리면 여기서 뺀다.
const NOT_COLUMN = new Set(["id"]);  // id는 항상 존재하지만 안전하게 통과시킨다

const bad = [];
const files = ROOTS.flatMap((d) => walk(join(ROOT, d)));
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let q;
  while ((q = RE_QUERY.exec(src))) {
    const body = q[1];
    if (!/\bcafes\b/i.test(body)) continue; // cafes를 안 건드리는 쿼리는 통과
    // 같은 쿼리 안에서 `... AS alias`로 만든 이름은 컬럼이 아니다(예: synth_grade AS grade → c.grade).
    const aliases = new Set([...body.matchAll(/\bAS\s+"?([a-z_][a-z_0-9]*)"?/gi)].map((x) => x[1].toLowerCase()));
    let m;
    while ((m = RE_COL.exec(body))) {
      const col = m[1];
      if (NOT_COLUMN.has(col) || cols.has(col) || aliases.has(col)) continue;
      bad.push({ file: file.replace(ROOT, ""), col });
    }
  }
}

if (bad.length) {
  console.error("🔴 배포 중단 — cafes에 없는 컬럼을 참조합니다:");
  const seen = new Set();
  for (const b of bad) {
    const k = `${b.file}:${b.col}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.error(`   ${b.file}  →  cafes.${b.col} 없음`);
  }
  console.error("\n   조치: ALTER TABLE로 컬럼을 **먼저** 만들고 배포하세요.");
  console.error("   (스키마 변경을 크론에 맡기면 크론이 배포보다 늦게 돌아 전체 404가 납니다 — 2026-08-30 사고)");
  process.exit(1);
}

console.log(`✅ preflight 통과 — cafes 컬럼 참조 정상(스키마 ${cols.size}개 대조)`);
