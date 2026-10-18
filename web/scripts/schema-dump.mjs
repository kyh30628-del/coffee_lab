// 🏗️ 스키마 내보내기 — 새 DB에서 서비스를 처음부터 세울 수 있게 한다. (2026-10-18 신설)
//
// 왜: CEO 지시(2026-10-18) "서비스 자체를 판매할 것을 염두에 두고 설계·개발하라".
//   실측에서 **스키마·마이그레이션 파일이 0개**였다 — 코드는 넘길 수 있는데 **양수인이 DB를 세울 수 없다.**
//   재현 불가능한 시스템은 실사에서 값이 안 매겨진다(매각 제약 8개 중 2번).
//   덤프는 **구조만**이다 — 데이터는 넘기지 않는다(출처 계보에 따라 재수집 대상이 있다).
//
// 💰 비용: information_schema·pg_indexes 읽기만(카탈로그, 수 KB). 로컬 실행 → Vercel 함수 0.
// 사용: node --import tsx scripts/schema-dump.mjs   → db/schema.sql 갱신
import { writeFileSync } from "node:fs";
import { connect } from "./lib/probe.mjs";
const { q } = await connect();

const cols = await q`SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default,
    character_maximum_length len, numeric_precision np, numeric_scale ns, ordinal_position
  FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position`;
const idx = await q`SELECT tablename, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname`;
const cons = await q`SELECT tc.table_name, tc.constraint_type, tc.constraint_name,
    pg_get_constraintdef(pgc.oid) def
  FROM information_schema.table_constraints tc
  JOIN pg_constraint pgc ON pgc.conname = tc.constraint_name
  WHERE tc.table_schema='public' AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE','FOREIGN KEY','CHECK')
  ORDER BY tc.table_name, tc.constraint_type`;

const typeOf = (c) => {
  const t = c.data_type;
  if (t === "character varying") return c.len ? `varchar(${c.len})` : "text";
  if (t === "numeric" && c.np) return `numeric(${c.np},${c.ns ?? 0})`;
  if (t === "ARRAY") return `${String(c.udt_name).replace(/^_/, "")}[]`;
  if (t === "USER-DEFINED") return c.udt_name;
  if (t === "timestamp without time zone") return "timestamp";
  if (t === "timestamp with time zone") return "timestamptz";
  return t;
};

const byTable = new Map();
for (const c of cols) { if (!byTable.has(c.table_name)) byTable.set(c.table_name, []); byTable.get(c.table_name).push(c); }

const out = [];
out.push("-- 동네 커피 노트 — 데이터베이스 스키마 (구조만, 데이터 없음)");
out.push(`-- 자동 생성: scripts/schema-dump.mjs · ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ")} KST`);
out.push("-- ⚠️ 손으로 고치지 말 것 — 스크립트를 다시 돌려 갱신한다.");
out.push("-- 새 환경 세우는 순서: ① 이 파일 실행 ② .env.example 보고 환경변수 채움 ③ lib/criteria.ts DEFAULTS가 폴백이므로 criteria 테이블은 비어도 동작");
out.push(`-- 테이블 ${byTable.size}개 · 컬럼 ${cols.length}개 · 인덱스 ${idx.length}개 · 제약 ${cons.length}개`);
out.push("");
if (cols.some((c) => c.udt_name === "vector")) out.push("CREATE EXTENSION IF NOT EXISTS vector;\n");

for (const [t, cs] of [...byTable].sort()) {
  out.push(`CREATE TABLE IF NOT EXISTS ${t} (`);
  const lines = cs.map((c) => {
    let s = `  ${c.column_name} ${typeOf(c)}`;
    if (c.column_default) s += ` DEFAULT ${c.column_default}`;
    if (c.is_nullable === "NO") s += " NOT NULL";
    return s;
  });
  for (const k of cons.filter((x) => x.table_name === t && x.constraint_type !== "FOREIGN KEY"))
    lines.push(`  CONSTRAINT ${k.constraint_name} ${k.def}`);
  out.push(lines.join(",\n"));
  out.push(");");
  for (const i of idx.filter((x) => x.tablename === t && !/_pkey$/.test(x.indexdef) && !cons.some((k) => x.indexdef.includes(k.constraint_name))))
    out.push(i.indexdef.replace(/^CREATE (UNIQUE )?INDEX /, "CREATE $1INDEX IF NOT EXISTS ") + ";");
  out.push("");
}
const fks = cons.filter((x) => x.constraint_type === "FOREIGN KEY");
if (fks.length) {
  out.push("-- 외래키는 테이블 생성 뒤에 붙인다(순서 의존 제거)");
  for (const k of fks) out.push(`ALTER TABLE ${k.table_name} ADD CONSTRAINT ${k.constraint_name} ${k.def};`);
}
writeFileSync("db/schema.sql", out.join("\n") + "\n");
console.log(`✅ db/schema.sql — 테이블 ${byTable.size}개 · 컬럼 ${cols.length}개 · 인덱스 ${idx.length}개 · 제약 ${cons.length}개`);
