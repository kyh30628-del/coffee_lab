// 🛡️ 기준 검증 에이전트 v1 — **결정론(LLM 없음)**. 비즈니스 기준(criteria)이 코드에 제대로 적용돼 있는지 스스로 검증.
//   품질본부 소유 · 기획조정실장(L2) 관장. cron-criteria-verify(Vercel cron)와 /admin/org 상태카드가 함께 쓰는 단일 검증 로직.
//   ⚠️ lib/issues.ts(이슈↔결재 자동변환) 동결영역 절대 미접촉 — 발견은 report 테이블·관제탑 카드·(하드FAIL만)recordRun 실패경로로만 표면화.
//
//   3계층 검사(전부 결정론):
//   (a) 정적/dead-knob: 각 criterion 키가 실제 소비 코드에서 getCriterion(Sync)로 참조되는지. 참조 0 = dead knob(방금 그 사고).
//   (b) 충실도/드리프트: DB값이 min~max 범위 내·시드 default_value가 코드 DEFAULTS와 정합.
//   (c) 동적/실효과: 대표 기준의 실제 DB 효과 샘플검사(등급바닥·좌표박스). 프록시라 최대 'warn'(빨강 금지 — CLAUDE.md §3).
import fs from "node:fs";
import path from "node:path";
import { sql } from "./db";
import { META, DEFAULTS, getCriteria, ensureCriteriaTable, inRange } from "./criteria";
import { listKeys } from "./criteriaLists";

export type CriteriaCheck = { key: string; label: string; severity: "fail" | "warn"; count: number; samples: string[] };
export type CriteriaReport = { ranAt: string; status: "pass" | "warn" | "fail"; fails: number; warns: number; checks: CriteriaCheck[]; deadKnobs: string[]; scanned: number };

// ── (a) 정적 dead-knob 스캔 — 순수(fs만, DB·LLM 없음). 소비 코드에서 getCriterion(Sync)("key")로 참조되는지.
//   런타임(Vercel)에선 next.config outputFileTracingIncludes가 lib/·app/api/ 소스를 함수 번들에 포함시켜 읽는다.
//   소스를 못 읽으면 false-fail 대신 스캔불가로 리턴(호출부가 warn 처리) — 서비스·감시 신뢰 보호.
const SKIP_FILE = /(^|\/)(criteria\.ts|criteriaVerify\.ts|criteriaLists\.ts)$/; // 관제·검증·리스트정의 자신은 소비처가 아님
const SKIP_DIR = /(^|\/)(node_modules|\.next|admin\/criteria|api\/admin\/criteria|api\/cron-criteria-verify)(\/|$)/;

function collectSource(roots: string[]): { files: string[]; readable: boolean } {
  const files: string[] = [];
  let readable = false;
  const walk = (dir: string) => {
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); readable = true; } catch { return; }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIR.test(full)) walk(full); }
      else if (/\.(ts|tsx)$/.test(e.name) && !SKIP_FILE.test(full) && !SKIP_DIR.test(full)) files.push(full);
    }
  };
  for (const r of roots) walk(r);
  return { files, readable };
}

/** META 키별로 소비 코드 참조 여부를 반환. 참조 0 = dead knob. cwdOverride는 테스트용. */
export function scanCriteriaUsage(cwdOverride?: string): { usage: Record<string, number>; readable: boolean; scanned: number } {
  const base = cwdOverride ?? process.cwd();
  const { files, readable } = collectSource([path.join(base, "lib"), path.join(base, "app", "api")]);
  const usage: Record<string, number> = Object.fromEntries(META.map((m) => [m.key, 0]));
  for (const f of files) {
    let src: string;
    try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
    for (const m of META) {
      // getCriterion("key") 또는 getCriterionSync('key') 인자로 등장하는 리터럴만 참조로 인정(정밀).
      const re = new RegExp(`getCriterion(Sync)?\\(\\s*["']${m.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`);
      if (re.test(src)) usage[m.key]++;
    }
  }
  return { usage, readable, scanned: files.length };
}

/** 리스트 사전 키별 소비 코드 참조 여부(v1 참조확인) — 키 리터럴("char.roast.kws")이 소비 소스에 등장하는지.
 *  소비처는 getListSync/getListSetSync에 리터럴 키를 넘기거나 구조에 listKey/triggersKey 리터럴로 보유(둘 다 스캔 매칭).
 *  참조 0 = dead list(무배포 편집해도 서비스 무반응). criteriaLists.ts(정의)·admin 은 SKIP되어 자기참조로 오탐 안 남. */
export function scanListUsage(cwdOverride?: string): { usage: Record<string, number>; readable: boolean; scanned: number } {
  const base = cwdOverride ?? process.cwd();
  const { files, readable } = collectSource([path.join(base, "lib"), path.join(base, "app", "api")]);
  const keys = listKeys();
  const usage: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const f of files) {
    let src: string;
    try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
    for (const k of keys) {
      const re = new RegExp(`["']${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`);
      if (re.test(src)) usage[k]++;
    }
  }
  return { usage, readable, scanned: files.length };
}

// ── 전체 검증 실행 ──────────────────────────────────────────────────────────
export async function runCriteriaChecks(): Promise<CriteriaReport> {
  const checks: CriteriaCheck[] = [];
  const add = (key: string, label: string, severity: "fail" | "warn", count: number, samples: string[]) =>
    checks.push({ key, label, severity, count, samples });

  // (a) 정적 dead-knob
  const { usage, readable, scanned } = scanCriteriaUsage();
  const deadKnobs = readable ? Object.keys(usage).filter((k) => usage[k] === 0) : [];
  if (!readable) {
    add("dead_knob_scan", "정적 dead-knob 스캔 불가(소스 미접근)", "warn", 1, ["번들 트레이싱 확인 필요"]);
  } else {
    add("dead_knob", "코드가 참조하지 않는 기준(dead knob — 무배포 조정해도 서비스 무반응)", "fail", deadKnobs.length, deadKnobs);
  }

  // (a-2) 리스트 사전 dead-knob — 새 사전 키가 실제 소비 코드에 물렸는지(v1 참조확인).
  const lu = scanListUsage();
  const deadLists = lu.readable ? Object.keys(lu.usage).filter((k) => lu.usage[k] === 0) : [];
  if (!lu.readable) {
    add("dead_list_scan", "리스트 사전 참조 스캔 불가(소스 미접근)", "warn", 1, ["번들 트레이싱 확인 필요"]);
  } else {
    add("dead_list", "코드가 참조하지 않는 리스트 사전(무배포 편집해도 서비스 무반응)", "fail", deadLists.length, deadLists);
  }

  // (b) 충실도/드리프트 — criteria 테이블 대조
  await ensureCriteriaTable();
  const rows = (await sql`SELECT key, value, default_value, min_value, max_value FROM criteria`) as
    { key: string; value: number; default_value: number; min_value: number; max_value: number }[];
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const outOfRange = META.filter((m) => { const r = byKey.get(m.key); return r && !inRange(m.key, Number(r.value)); }).map((m) => `${m.key}=${byKey.get(m.key)!.value}`);
  add("value_out_of_range", "기준값이 허용 범위 밖(운영실수·마이그레이션 드리프트 → 코드가 DEFAULTS로 폴백)", "fail", outOfRange.length, outOfRange);

  const missing = META.filter((m) => !byKey.has(m.key)).map((m) => m.key);
  add("unseeded_key", "criteria 테이블에 미시드된 기준(폴백 동작 — 시드 필요)", "warn", missing.length, missing);

  const seedDrift = META.filter((m) => { const r = byKey.get(m.key); return r && Number(r.default_value) !== m.def; }).map((m) => `${m.key}: DB def ${byKey.get(m.key)!.default_value} ≠ 코드 ${m.def}`);
  add("seed_drift", "시드 기본값(default_value)이 코드 DEFAULTS와 불일치", "warn", seedDrift.length, seedDrift);

  // (c) 동적/실효과 샘플 — 대표 기준이 DB에 실제로 반영돼 있나. 프록시라 최대 warn.
  const cur = await getCriteria();
  try {
    const latMin = cur["geo.box.lat_min"], latMax = cur["geo.box.lat_max"], lngMin = cur["geo.box.lng_min"], lngMax = cur["geo.box.lng_max"];
    const outBox = (await sql`SELECT count(*)::int n FROM cafes WHERE published AND (lat IS NULL OR lng IS NULL OR NOT (lat BETWEEN ${latMin} AND ${latMax} AND lng BETWEEN ${lngMin} AND ${lngMax}))`) as { n: number }[];
    const sampBox = (await sql`SELECT name s FROM cafes WHERE published AND (lat IS NULL OR lng IS NULL OR NOT (lat BETWEEN ${latMin} AND ${latMax} AND lng BETWEEN ${lngMin} AND ${lngMax})) LIMIT 6`) as { s: string }[];
    add("geo_box_effect", "좌표박스 기준 실효과: 현 기준 밖인데 공개 중인 카페(박스 적용 어긋남 신호)", "warn", Number(outBox[0]?.n ?? 0), sampBox.map((r) => r.s));

    const vFloor = cur["grade.floor.verified"];
    const gradeMismatch = (await sql`SELECT count(*)::int n FROM cafes WHERE published AND synth_grade='검증' AND COALESCE(synth_count,0) < ${vFloor}`) as { n: number }[];
    const sampGrade = (await sql`SELECT name s FROM cafes WHERE published AND synth_grade='검증' AND COALESCE(synth_count,0) < ${vFloor} LIMIT 6`) as { s: string }[];
    add("grade_floor_effect", "등급바닥 기준 실효과: '검증'인데 검증리뷰 수가 현 바닥 미만(기준 미반영 신호)", "warn", Number(gradeMismatch[0]?.n ?? 0), sampGrade.map((r) => r.s));
  } catch {
    // cafes 스키마 상이·DB 오류 → 동적검사만 생략(정적·충실도는 유지). 서비스 무관.
    add("dynamic_effect_skip", "동적 실효과 샘플 생략(스키마·DB)", "warn", 0, []);
  }

  const active = checks.filter((c) => c.count > 0);
  const fails = active.filter((c) => c.severity === "fail").length;
  const warns = active.filter((c) => c.severity === "warn").length;
  const status: CriteriaReport["status"] = fails > 0 ? "fail" : warns > 0 ? "warn" : "pass";
  return { ranAt: new Date().toISOString(), status, fails, warns, checks, deadKnobs, scanned };
}

export async function ensureCriteriaVerifyTable(): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS criteria_verify_reports (
    id BIGSERIAL PRIMARY KEY,
    ran_at TIMESTAMPTZ DEFAULT now(),
    status TEXT,
    fails INT,
    warns INT,
    dead_knobs TEXT,
    checks JSONB
  )`;
}
