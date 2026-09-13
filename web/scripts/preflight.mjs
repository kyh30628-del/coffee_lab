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

console.log(`✅ cafes 컬럼 참조 정상(스키마 ${cols.size}개 대조)`);

// ═══ ② 쿼리플랜 검사 — cafes 전체 스캔 금지(2026-09-13 비용사고 재발방지) ═══
//
// 그날 무슨 일이 있었나:
//   하루 전송량 338.6GB(임계 25GB)로 비용 차단기가 걸려 크론이 전부 멈췄다. 원인은 한 줄짜리 버그가 아니라
//   **인덱스를 못 타는 쿼리들이 조용히 쌓인 것**이었다 — 이름검색 185.6GB/1,437회, 관리자 집계 2.1GB×540회,
//   오염 워터마크 조회가 0행을 찾으려고 108MB×558회. 전부 "동작은 맞고 느리기만 한" 코드라 아무도 안 잡았다.
//
// 왜 검사인가:
//   이런 건 리뷰로 못 잡는다. 테이블이 커지면 어제 싼 쿼리가 오늘 비싸진다.
//   사람이 매번 EXPLAIN 하지 않는다 → 기계가 배포 전에 막는다.
//
// 무엇을 검사하나: 실제로 자주 도는 쿼리를 EXPLAIN(실행 안 함)해서 cafes에 Seq Scan이 뜨면 배포를 멈춘다.
//   ⚠️ 새로 만든 뜨거운 쿼리는 여기에 추가할 것. 여기 없으면 다음에도 조용히 샌다.
const HOT = [
  ["검색: 카페 이름", `SELECT id, name FROM cafes WHERE published = true AND replace(lower(name), ' ', '') LIKE ANY(ARRAY['%프릳츠%']) LIMIT 8`],
  ["검색: 지역 목록", `SELECT area, count(*)::int n FROM cafes WHERE published AND area IS NOT NULL AND area <> '' GROUP BY area HAVING count(*) >= 5 ORDER BY n DESC`],
  ["관리자: 노이즈 집계", `SELECT AVG(sq_rejected::float / NULLIF(sq_raw::float,0)) FROM cafes WHERE sq_raw IS NOT NULL`],
  ["치유기: offconcept 대기열", `SELECT id FROM cafes WHERE published = true AND synth_reviews IS NOT NULL AND (offconcept_scan_at IS NULL OR synth_updated > offconcept_scan_at) ORDER BY synth_updated DESC NULLS LAST LIMIT 3000`],
  ["지도/홈: 버전 쿼리", `SELECT COUNT(*)::int n, COALESCE(MAX(updated_at)::text,'') u, COALESCE(MAX(synth_updated)::text,'') s FROM cafes WHERE published = true`],
  ["치유기: noncafe 대기열", `SELECT id FROM cafes WHERE published = true AND synth_reviews IS NOT NULL AND (noncafe_scan_at IS NULL OR synth_updated > noncafe_scan_at) ORDER BY synth_updated DESC NULLS LAST LIMIT 3000`],
  // 2026-09-13 2차 — 위 6개를 막은 그날에도 **이 쿼리는 빠져 있었다**(누계 122GB, 디스크 읽기 1위).
  //   교훈: 목록에 없는 쿼리는 검사가 아니라 사각지대다. 새 뜨거운 쿼리는 반드시 여기 추가할 것.
  ["검색: 개념축 보강", `SELECT id, name FROM cafes WHERE published = true AND embedding IS NOT NULL AND jsonb_path_query_array(char_scores, '$.keyvalue() ? (@.value > 0).key') ?| ARRAY['nokids'] ORDER BY (SELECT MAX((char_scores->>ax)::numeric) FROM unnest(ARRAY['nokids']) ax) DESC LIMIT 40`],
];
const slow = [];
for (const [label, q] of HOT) {
  try {
    const rows = await sql.query("EXPLAIN " + q);
    const plan = rows.map((r) => String(r["QUERY PLAN"] ?? Object.values(r)[0])).join("\n");
    if (/Seq Scan on cafes/.test(plan)) slow.push({ label, plan: plan.split("\n").find((l) => l.includes("Seq Scan on cafes")).trim() });
  } catch (e) {
    slow.push({ label, plan: `EXPLAIN 실패: ${e.message}` }); // 컬럼·인덱스가 없어도 여기서 걸린다
  }
}
if (slow.length) {
  console.error("🔴 배포 중단 — cafes 전체 스캔(또는 EXPLAIN 실패)이 있습니다:");
  for (const s of slow) console.error(`   ${s.label}\n      ${s.plan}`);
  console.error("\n   조치: 인덱스를 만들거나(부분·표현식 인덱스) 필터를 인덱스 탈 수 있는 모양으로 바꾸세요.");
  console.error("   한 번 전체 스캔이 뚫리면 호출수만큼 곱해져 하루 수백 GB가 됩니다(2026-09-13: 338.6GB).");
  process.exit(1);
}
console.log(`✅ preflight 통과 — 뜨거운 쿼리 ${HOT.length}개 전부 인덱스 사용`);
