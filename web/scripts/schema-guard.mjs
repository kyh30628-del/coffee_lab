// 🛡️ 스키마 관문 — "없는 컬럼·없는 테이블을 조회하는데 .catch로 삼켜서 화면엔 0으로 보이는" 결함을 결정론으로 잡는다.
//
// 왜 필요한가(2026-10-18): 기획조정실장의 측정 오류 15건 중 4건이 **이름을 확인 없이 지어 쓴 것**이고,
//   2건은 **.catch(() => []) 가 실패를 삼켜 0건으로 보고된 것**이었다. 같은 조합이 서비스 코드에도 있으면
//   화면이 조용히 0을 보여준다(=CEO가 보는 숫자가 거짓). 사람이 눈으로 찾을 수 없으므로 기계가 본다.
//
// 어떻게: 소스에서 sql`...` 템플릿을 뽑아 `${...}` 자리를 NULL로 바꾸고 **EXPLAIN**에 건다.
//   EXPLAIN은 계획만 세우므로 **행을 읽지 않는다**(비용 ≈0). 실패 메시지로 셋을 가린다:
//     · relation/column does not exist → 🔴 진짜 결함
//     · syntax/type 오류            → ⚪ 검사불가(NULL 치환 부작용) — 결함으로 세지 않는다
// 사용: node scripts/schema-guard.mjs [--all]   (기본: app/ lib/ 만. --all은 scripts/ 포함)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

const ROOTS = process.argv.includes("--all") ? ["app", "lib", "scripts"] : ["app", "lib"];
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f);
  if (f === "node_modules" || f === "tmp" || f === ".next") continue;
  if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|mjs)$/.test(f)) files.push(p); } };
for (const r of ROOTS) walk(r);

// sql`...` 템플릿 추출 — 중첩 백틱이 없는 단순 케이스만(우리 코드 관행과 일치)
const found = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const re = /\bsql\s*`([\s\S]*?)`/g;
  let m, idx = 0;
  while ((m = re.exec(src))) {
    const q = m[1];
    if (!/\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(q)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    // ${...} → NULL. sql.unsafe가 섞인 건 검사불가로 분류.
    const unsafe = /\$\{\s*sql\.unsafe/.test(q);
    const text = q.replace(/\$\{[^}]*\}/g, "NULL");
    found.push({ f, line, text, unsafe, guarded: /\.catch\(\s*\(\s*\)\s*=>/.test(src.slice(m.index, m.index + q.length + 200)) });
    idx++;
  }
}

let bad = 0, skipped = 0, ok = 0;
const defects = [];
for (const q of found) {
  if (q.unsafe) { skipped++; continue; }
  try {
    await sql.query(`EXPLAIN ${q.text}`);
    ok++;
  } catch (e) {
    const msg = String(e?.message || e);
    if (/does not exist/i.test(msg) && /(column|relation|function)/i.test(msg)) {
      bad++; defects.push({ ...q, msg: msg.split("\n")[0] });
    } else skipped++;
  }
}

console.log(`🛡️ 스키마 관문 — sql 템플릿 ${found.length}개 검사 (파일 ${files.length}개)`);
console.log(`   ✅ 통과 ${ok} · ⚪ 검사불가 ${skipped}(NULL치환·동적SQL) · 🔴 결함 ${bad}`);
if (defects.length) {
  console.log(`\n🔴 없는 테이블/컬럼을 조회하는 쿼리 ${defects.length}건`);
  for (const d of defects) console.log(`   ${d.f}:${d.line}${d.guarded ? " [.catch로 삼켜짐 → 화면엔 0]" : ""}\n      ${d.msg}`);
  process.exitCode = 1;
}
