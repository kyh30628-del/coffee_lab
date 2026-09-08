// 💰 비용 사전점검 가드 — cron-verify(및 유사 결정론 검증 잡)에 신규 SQL을 추가할 때
//   공개 카페 전수를 스캔하며 대용량 jsonb 컬럼(synth_reviews·synth_reviews_all·raw_reviews)을
//   옵션(단건 id 필터·LIMIT) 없이 그대로 읽는 패턴을 정적으로 잡아낸다.
//   09-06 349.5GB 자기유발 비용사고(decisions#1010/#1011)의 원인 쿼리 형태(published 전수 ×
//   jsonb_array_elements/CROSS JOIN 풀스캔)를 재발 방지. 결정론 검사기 — LLM 미사용.
//
//   사용법(배포 전 수동 실행 — dev-deploy 전 습관화):
//     node scripts/cost-preflight-guard.mjs                         # 기본: cron-verify route 검사
//     node scripts/cost-preflight-guard.mjs app/api/cron-foo/route.ts ...  # 특정 파일 검사
//
//   ⚠️ 이 스크립트만으로 끝나지 않는다 — 경고가 뜨면 EXPLAIN(ANALYZE, BUFFERS)로 seq scan 대상
//   행수·예상 I/O를 실제 확인한 뒤에만 배포한다(체크리스트: app/api/cron-verify/route.ts 상단 주석).
import { readFileSync } from "fs";

const DEFAULT_TARGETS = ["app/api/cron-verify/route.ts"];
const HEAVY_COLS = ["synth_reviews_all", "synth_reviews", "raw_reviews"];
const heavyRe = new RegExp(`\\b(${HEAVY_COLS.join("|")})\\b`, "g");

function extractSqlBlocks(src) {
  // sql`...` 태그드 템플릿 블록만 추출(이 코드베이스는 백틱 안에 백틱을 중첩하지 않음).
  const blocks = [];
  const re = /\bsql`([^`]*)`/gs;
  let m;
  while ((m = re.exec(src))) blocks.push({ text: m[1], index: m.index });
  return blocks;
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

function analyze(block) {
  const heavy = [...new Set(block.match(heavyRe) || [])];
  if (heavy.length === 0) return null;
  const scansCafesPublished = /FROM\s+cafes\b/i.test(block) && /published/i.test(block);
  const singleRowScoped =
    /WHERE\s+(\w+\.)?id\s*=/i.test(block) ||
    /WHERE\s+(\w+\.)?cafe_id\s*=/i.test(block) ||
    /\bLIMIT\s+1\b/i.test(block);
  if (scansCafesPublished && !singleRowScoped) {
    return { heavy, reason: "published 전수 스캔 + 대용량 jsonb 컬럼 직접 참조(옵션 없음)" };
  }
  return null;
}

function checkFile(path) {
  let src;
  try {
    src = readFileSync(path, "utf8");
  } catch {
    console.log(`SKIP: ${path} (파일 없음)`);
    return [];
  }
  const findings = [];
  for (const { text, index } of extractSqlBlocks(src)) {
    const hit = analyze(text);
    if (hit) findings.push({ path, line: lineOf(src, index), ...hit });
  }
  return findings;
}

const targets = process.argv.slice(2).filter(Boolean);
const files = targets.length ? targets : DEFAULT_TARGETS;

let all = [];
for (const f of files) all = all.concat(checkFile(f));

if (all.length === 0) {
  console.log("OK — 대용량 jsonb 컬럼 옵션없는 전수스캔 패턴 없음");
  process.exit(0);
}

for (const f of all) {
  console.log(
    `WARN: ${f.path}:${f.line} — ${f.reason} [${f.heavy.join(", ")}]\n  → 배포 전 EXPLAIN(ANALYZE, BUFFERS)로 seq scan 행수·I/O 확인 필수`
  );
}
process.exit(1);
