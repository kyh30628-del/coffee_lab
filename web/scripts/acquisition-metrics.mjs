// 📄 매각·실사 자료의 숫자 **단일 출처**. (2026-10-18 신설)
//
// 왜 이게 필요한가:
//   `docs/ACQUISITION.md`를 쓰면서 같은 항목을 그때그때 다른 명령으로 세어 숫자가 갈라졌다 —
//   판정 함수 16 vs 19 · decisions 참조 123 vs 141 · 주석 줄 722 vs 1,436 · 정규식 242/344/637/2,469.
//   **오늘 하루 종일 고친 "정의가 두 갈래" 병을 자료에서 또 저지른 것이다.**
//   매각 자료의 신뢰는 숫자가 아니라 **그 숫자를 다시 뽑을 수 있는가**에서 온다.
//   → 항목마다 **정의를 코드로 못 박고** 여기서만 센다. 문서는 이 출력을 옮긴다.
//
// 사용: node --import tsx scripts/acquisition-metrics.mjs [--json]
// 💰 비용: 집계 쿼리 4개(작은 컬럼) + 소스 파일 읽기. 큰 blob 미접촉. 로컬 실행 → Vercel 0.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const JSON_OUT = process.argv.includes("--json");

// ── 정의(코드가 진실) ─────────────────────────────────────────────
// 엔진 규모: **판정 엔진 = lib/reviewQuality.ts**, 품질 엔진 전체 = 아래 4파일.
const ENGINE = "lib/reviewQuality.ts";
const QUALITY_FILES = ["lib/reviewQuality.ts", "lib/synthStore.ts", "lib/collectOrchestrator.ts", "lib/cafeProfile.ts"];
const LIB_TS = readdirSync("lib").filter((f) => f.endsWith(".ts")).map((f) => `lib/${f}`);

const src = readFileSync(ENGINE, "utf8");
const allLib = LIB_TS.map((f) => readFileSync(f, "utf8")).join("\n");
const countUnique = (text, re) => new Set(text.match(re) ?? []).size;
const lines = (f) => readFileSync(f, "utf8").split("\n").length;

const code = {
  // 판정 함수 = `export function` / `export async function` (export const는 사전·상수라 제외)
  judgeFunctions: (src.match(/^export (?:async )?function /gm) ?? []).length,
  // 이름 붙은 규칙 상수 = 파일 최상단의 대문자 상수 선언
  ruleConstants: (src.match(/^const [A-Z][A-Z0-9_]+ = /gm) ?? []).length,
  // 거절 경로 = verdict "rejected"를 돌려주는 지점
  rejectPaths: (src.match(/verdict: "rejected"/g) ?? []).length,
  engineLines: lines(ENGINE),
  engineCommentLines: (src.match(/^\s*\/\//gm) ?? []).length,
  qualityEngineLines: QUALITY_FILES.reduce((s, f) => s + lines(f), 0),
  // 사건 이력(lib/*.ts 전체, 중복 제거)
  decisions: countUnique(allLib, /decisions#\d+/g),
  coordination: countUnique(allLib, /coord(?:ination)?#\d+/g),
  rulegapProposals: countUnique(allLib, /rulegap[-a-z0-9]*/g),
  citedCafeIds: countUnique(allLib, /\bid\d{3,6}\b/g),
  repairDates: countUnique(allLib, /20\d{2}-\d{2}-\d{2}/g),
  libModules: LIB_TS.length,
  routes: Number(execSync("find app -name route.ts | wc -l", { encoding: "utf8" }).trim()),
  screens: Number(execSync("find app -name page.tsx | wc -l", { encoding: "utf8" }).trim()),
  // 자율 조직
  runners: existsSync("../agents") ? readdirSync("../agents").filter((f) => f.endsWith(".sh")).length : 0,
  agentCharters: existsSync("../agents") ? readdirSync("../agents").filter((f) => f.endsWith(".md")).length : 0,
  launchdTemplates: existsSync("../agents/launchd") ? readdirSync("../agents/launchd").filter((f) => f.endsWith(".tmpl")).length : 0,
  // 관문
  moatTests: Number((execSync("node --import tsx --test lib/__tests__/moat.test.ts 2>&1 | grep -oE 'pass [0-9]+' | head -1", { encoding: "utf8" }).match(/\d+/) ?? [0])[0]),
};

const db = (await sql`SELECT
  count(*)::int reviewed,
  count(*) FILTER (WHERE published)::int published,
  count(*) FILTER (WHERE published AND synth_grade='검증')::int gradeVerified,
  count(*) FILTER (WHERE published AND synth_grade='참고')::int gradeReference,
  count(*) FILTER (WHERE raw_reviews IS NOT NULL)::int withRaw,
  count(*) FILTER (WHERE published AND raw_reviews IS NULL)::int publishedRawPurged,
  count(DISTINCT area)::int areas, count(DISTINCT dong)::int dongs,
  COALESCE(SUM(jsonb_array_length(raw_reviews)),0)::bigint rawReviews,
  -- ⚠️ '화면에 나가는 후기'는 **공개 카페 기준**이다(/trust 화면과 같은 정의).
  --    원본 보유 기준으로 세면 원본이 파기된 공개 카페만큼 빠진다(실측 8,277곳).
  COALESCE(SUM(synth_count) FILTER (WHERE published),0)::bigint shownReviews,
  count(*) FILTER (WHERE NOT COALESCE(published,false) AND pipeline_status IN ('excluded','held'))::int quarantined
  FROM cafes`)[0];

const traffic = (await sql`SELECT count(DISTINCT anon_id)::int visitors7, count(*)::int pv7
  FROM traffic_events WHERE ts > now() - interval '7 days'
    AND anon_id NOT IN (SELECT anon_id FROM bot_anon_cache)`)[0];
const ops = (await sql`SELECT count(DISTINCT job)::int jobs24, count(*)::int runs24
  FROM run_ledger WHERE started_at > now() - interval '24 hours'`)[0];
const biz = (await sql`SELECT (SELECT count(*)::int FROM payments) payments,
  (SELECT count(*)::int FROM subscriptions) subscriptions,
  (SELECT count(DISTINCT anon_id)::int FROM owner_funnel_events) ownerFunnel`)[0];

const out = { measuredAt: new Date().toISOString(), code, db, traffic, ops, biz };
if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }

const n = (v) => Number(v ?? 0).toLocaleString();
console.log(`📄 매각 자료 숫자 — ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ")} KST`);
console.log(`\n[데이터]`);
console.log(`  검토 ${n(db.reviewed)} · 공개 ${n(db.published)} (검증 ${n(db.gradeverified ?? db.gradeVerified)} · 참고 ${n(db.gradereference ?? db.gradeReference)})`);
console.log(`  시군구 ${db.areas} · 동 ${n(db.dongs)} · 격리 ${n(db.quarantined)}`);
console.log(`  원본 후기 ${n(db.rawreviews ?? db.rawReviews)}건 · 화면에 나가는 후기 ${n(db.shownreviews ?? db.shownReviews)}건(공개 기준)`);
console.log(`  원본 보유 ${n(db.withraw ?? db.withRaw)}곳 · 공개인데 원본 파기 ${n(db.publishedrawpurged ?? db.publishedRawPurged)}곳`);
console.log(`\n[엔진]`);
console.log(`  판정 함수 ${code.judgeFunctions} · 규칙 상수 ${code.ruleConstants} · 거절 경로 ${code.rejectPaths}`);
console.log(`  판정 엔진 ${n(code.engineLines)}줄(주석 ${n(code.engineCommentLines)}줄) · 품질 엔진 4파일 ${n(code.qualityEngineLines)}줄`);
console.log(`  불변식 테스트 ${code.moatTests}건`);
console.log(`\n[사건 이력 — 복제 난이도의 근거]`);
console.log(`  결재 ${code.decisions}건 · 협업 ${code.coordination}건 · 룰갭 제안 ${code.rulegapProposals}건`);
console.log(`  인용된 실제 카페 ${code.citedCafeIds}곳 · 수리 날짜 ${code.repairDates}개`);
console.log(`\n[규모·조직]`);
console.log(`  lib 모듈 ${code.libModules} · 라우트 ${code.routes} · 화면 ${code.screens}`);
console.log(`  러너 ${code.runners} · 에이전트 헌법 ${code.agentCharters} · launchd 템플릿 ${code.launchdTemplates}`);
console.log(`\n[운영·사업]`);
console.log(`  사람 방문자(7일) ${n(traffic.visitors7)}명 · PV ${n(traffic.pv7)}`);
console.log(`  자동 실행(24h) ${ops.jobs24}종 · ${n(ops.runs24)}회`);
console.log(`  유료 결제 ${biz.payments}건 · 구독 ${biz.subscriptions}건 · 사장님 퍼널 ${biz.ownerfunnel ?? biz.ownerFunnel}명`);
console.log(`\n⚠️ docs/ACQUISITION.md의 숫자는 **이 출력만** 옮긴다. 다른 명령으로 세면 정의가 갈라진다.`);
