import { sql } from "./db";
import { createHash } from "node:crypto";

// 📒 실행 원장(Run Ledger) — 하네스 L5.
//
// 왜 필요한가(2026-08-08 실증): `agent_runs`는 `job`이 PRIMARY KEY인 **upsert**라 job당 최신 1행만 남는다.
//   그래서 "실패 0건·정상"으로 보이는 동안에도 자율 치유기가 6일째 같은 일을 반복(감지22/치유10 6회 연속)하고
//   있었고, 그걸 발견한 건 순전히 `sentinel_reports`가 우연히 append였기 때문이다.
//   **이력이 없으면 '추세 이상'(같은 결과 N회 반복)은 구조적으로 볼 수 없다.**
//
// 설계 원칙
//   ① 순수 추가 — `agent_runs` upsert는 그대로 둔다(관제탑 '현재 상태' 화면이 의존).
//   ② 기록 실패가 본 작업을 절대 깨지 않는다(전부 graceful).
//   ③ 지문(fingerprint)에 **시각·난수 금지** — 같은 상태면 같은 지문이어야 정체를 잡는다.
//   ④ 보존 90일 · 행 ~300B · 하루 ~130행 ⇒ 월 1MB 남짓(비용 무시 가능).

let ensured = false;
async function ensure(): Promise<void> {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS run_ledger (
    id BIGSERIAL PRIMARY KEY,
    job TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ DEFAULT now(),
    ok BOOLEAN,
    effect_ok BOOLEAN,
    fingerprint TEXT,
    metrics JSONB,
    detail TEXT
  )`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS run_ledger_job_time ON run_ledger (job, started_at DESC)`.catch(() => {});
  ensured = true;
}

export type RunMetrics = {
  detected?: number; healed?: number; changed?: number;
  rows?: number; blobReads?: number; tokens?: number; apiCalls?: number;
  [k: string]: number | undefined;
};

/**
 * 이번 실행 '결과의 지문'. 같은 상태 → 같은 문자열이어야 한다.
 * ⚠️ 시각·난수·부동소수를 넣지 말 것(정체 탐지가 무력화된다).
 * 대상 id 배열은 정렬해 넣어야 순서 흔들림으로 지문이 갈리지 않는다.
 */
export function fingerprintOf(parts: Record<string, string | number | readonly (string | number)[] | undefined>): string {
  const norm = Object.keys(parts).sort().map((k) => {
    const v = parts[k];
    if (v === undefined) return `${k}=`;
    if (Array.isArray(v)) return `${k}=${[...v].map(String).sort().join(",")}`;
    return `${k}=${String(v)}`;
  }).join("|");
  return createHash("sha1").update(norm).digest("hex").slice(0, 16);
}

/**
 * 🔴 2026-10-18 — **효과 판정을 실제로 계산해서 쓴다.**
 *   그때까지 `effect_ok`는 최근 30일 **2,372건 전부 NULL**이었다. `recordLedger`가 `effectOk`를
 *   인자로 받긴 했지만 **넘기는 호출자가 하나도 없었고**, `jobContract`의 `effect: {kind:"monotone-decrease"}`
 *   선언도 **읽는 코드가 없었다**. 하네스 3원칙 1번("실행이 아니라 **효과**가 성공")이
 *   한 번도 실행된 적이 없었다는 뜻이다 — 선언만 있는 빈껍데기.
 *   (10-17에 내가 계약에 effect 선언 5개를 추가한 것도 소비자가 없어 아무 일도 하지 않았다.)
 *
 *   판정 규칙(계약 `effect.kind === "monotone-decrease"`인 잡만):
 *     이번 런이 "처리 0건 + 남은 일 있음"이고, 직전 런들도 같은 모양으로 `maxNoEffectRuns`회 이어지면
 *     → `effect_ok = false`. 그 외에는 `true`. 계량(updated/processed·remain)이 없으면 NULL(판정 불가).
 *   💰 비용: 계약에 effect가 선언된 잡(현재 6종)에만, 직전 N행의 **작은 컬럼**을 읽는 조회 1회.
 *     나머지 잡은 추가 조회 0. `detectNoProgress`와 같은 기준을 쓴다(판정이 두 갈래로 갈리지 않게).
 */
export function effectVerdictFor(
  metrics: { updated?: number; processed?: number; remain?: number } | undefined,
  prev: { ok?: boolean | null; updated?: number; processed?: number; remain?: number }[],
  maxNoEffectRuns: number,
  ok?: boolean,
): boolean | null {
  // 🧪 테스트 전용 순수판 — judgeEffect의 판정 규칙만 떼어낸 것(DB 미접촉). 둘이 갈라지면 테스트가 깨진다.
  if (ok === false) return null;
  const m = metrics ?? {};
  const done = Number(m.updated ?? m.processed ?? NaN);
  const left = Number(m.remain ?? NaN);
  if (!Number.isFinite(done) || !Number.isFinite(left)) return null;
  if (left <= 0 || done > 0) return true;
  const need = Math.max(1, maxNoEffectRuns);
  if (prev.length < need - 1) return true;
  for (const r of prev.slice(0, need - 1)) {
    const pd = Number(r.updated ?? r.processed ?? NaN);
    const pl = Number(r.remain ?? NaN);
    if (r.ok === false) return true;
    if (!Number.isFinite(pd) || !Number.isFinite(pl)) return true;
    if (pl <= 0 || pd > 0) return true;
  }
  return false;
}

async function judgeEffect(job: string, metrics?: RunMetrics, ok?: boolean): Promise<boolean | null> {
  try {
    const { getContract } = await import("./jobContract");
    const eff = getContract(job).effect;
    if (!eff || eff.kind !== "monotone-decrease") return null;
    if (ok === false) return null;                       // 실패는 ok로 이미 보고된다
    const m = (metrics ?? {}) as any;
    const done = Number(m.updated ?? m.processed ?? NaN);
    const left = Number(m.remain ?? NaN);
    if (!Number.isFinite(done) || !Number.isFinite(left)) return null; // 계량 없으면 판정 불가
    if (left <= 0 || done > 0) return true;              // 할 일 없음 또는 진척 있음 = 효과 있음
    const need = Math.max(1, eff.maxNoEffectRuns);
    const prev = (await sql`SELECT ok, metrics FROM run_ledger
      WHERE job = ${job} AND metrics IS NOT NULL
      ORDER BY started_at DESC LIMIT ${need - 1}`) as unknown as { ok: boolean | null; metrics: any }[];
    if (prev.length < need - 1) return true;             // 비교할 과거가 부족하면 아직 판정하지 않는다
    for (const r of prev) {
      const pm = r.metrics ?? {};
      const pd = Number(pm.updated ?? pm.processed ?? NaN);
      const pl = Number(pm.remain ?? NaN);
      if (r.ok === false) return true;                   // 사이에 실패가 끼면 연속이 아니다
      if (!Number.isFinite(pd) || !Number.isFinite(pl)) return true;
      if (pl <= 0 || pd > 0) return true;                // 진척이 있었던 런이 끼면 연속 끊김
    }
    return false;                                        // need회 연속 "처리 0 + 남은 일 있음" = 효과 없음
  } catch { return null; }
}

/** 원장에 1행 추가. 실패해도 조용히 넘어간다(본 작업 보호). */
export async function recordLedger(job: string, r: {
  ok?: boolean; effectOk?: boolean | null; fingerprint?: string;
  metrics?: RunMetrics; detail?: string; startedAt?: Date;
}): Promise<void> {
  try {
    await ensure();
    // 호출자가 명시로 넘기면 그대로 쓰고, 안 넘기면 계약을 보고 계산한다.
    if (r.effectOk === undefined) r = { ...r, effectOk: await judgeEffect(job, r.metrics, r.ok) };
    await sql`INSERT INTO run_ledger (job, started_at, ended_at, ok, effect_ok, fingerprint, metrics, detail)
      VALUES (${job}, ${r.startedAt ?? new Date()}, now(), ${r.ok ?? null}, ${r.effectOk ?? null},
              ${r.fingerprint ?? null}, ${r.metrics ? JSON.stringify(r.metrics) : null}::jsonb,
              ${String(r.detail ?? "").slice(0, 300)})`;
  } catch { /* 원장 기록 실패가 잡을 깨지 않게 */ }
}

export type StuckJob = { job: string; fingerprint: string; repeats: number; first_at: string; last_at: string };

/**
 * 🔁 정체(헛돎) 탐지 — **같은 지문이 N회 연속**이면 그 잡은 아무것도 바꾸지 못하고 반복 중이다.
 *   2026-08-08 지점오염 치유기가 정확히 이 모습이었다(6회 연속 감지22/치유10, DB는 무변).
 *   ⚠️ '연속'이어야 한다 — 단순 COUNT는 사이에 다른 결과가 끼어도 잡아 오탐이 난다.
 *
 * ⚠️ 2026-08-17 오탐 수리(2차): **지문 NULL = "치유할 게 없다"는 정상·성공 상태**인데,
 *   예전 쿼리는 `fingerprint IS NOT NULL`로 그 행을 아예 걸러냈다. 그래서 NULL 행이
 *   연속을 끊지도, 최신 상태로 인정되지도 못했다.
 *   실제 피해: cron-sentinel이 08-17 12:02(KST)에 치유대상 0으로 정상화됐는데도, 그 직전
 *   같은 지문 3회가 그대로 남아 **일을 끝냈다는 이유로 48시간 동안 '정체'로 찍혔다.**
 *   → NULL도 지문의 한 값으로 취급한다: 중간에 끼면 연속을 끊고, 최신이 NULL이면 판정 제외.
 */
export async function detectStuck(hours = 48, minRepeats = 3): Promise<StuckJob[]> {
  try {
    await ensure();
    const rows = (await sql`
      WITH recent AS (
        SELECT job, fingerprint, started_at,
               ROW_NUMBER() OVER (PARTITION BY job ORDER BY started_at DESC) AS rn
        FROM run_ledger
        WHERE started_at > now() - (${hours} * interval '1 hour')
      ), latest AS (
        -- 최신 런이 NULL(=치유대상 없음)이면 그 잡은 지금 건강하다 → 아예 후보에서 뺀다.
        SELECT job, fingerprint AS fp FROM recent WHERE rn = 1 AND fingerprint IS NOT NULL
      ), streak AS (
        SELECT r.job, r.fingerprint, r.started_at, l.fp,
               SUM(CASE WHEN r.fingerprint IS NOT DISTINCT FROM l.fp THEN 0 ELSE 1 END)
                 OVER (PARTITION BY r.job ORDER BY r.rn) AS broke
        FROM recent r JOIN latest l ON l.job = r.job
      )
      SELECT job, fp AS fingerprint, COUNT(*)::int AS repeats,
             MIN(started_at)::text AS first_at, MAX(started_at)::text AS last_at
      FROM streak WHERE broke = 0
      GROUP BY job, fp
      HAVING COUNT(*) >= ${minRepeats}
      ORDER BY COUNT(*) DESC`) as unknown as StuckJob[];
    // ⚠️ 2026-08-10 오탐 수리: '같은 지문 반복'은 **수렴을 약속한 잡**에서만 정체다.
    //   감시·수집형 잡(enrich·demand·closure·issues·grow·rulegap)은 "볼 게 없다/상태 그대로"가 정상인데,
    //   그 정상 상태가 매번 같은 지문이라 전부 정체로 찍혔다(실측 3~7건 전부 오탐).
    //   → 계약에 monotone-decrease(줄어들어야 함)를 선언한 잡만 정체 판정 대상으로 둔다.
    //   같은 실수의 재발 방지: "정상 상태를 문제로 표시하지 않는다"(CEO 지시 2026-08-09)의 하네스판.
    const { getContract } = await import("./jobContract");
    return rows.filter((r) => getContract(r.job).effect?.kind === "monotone-decrease");
  } catch { return []; }
}

export type NoProgressJob = { job: string; runs: number; remain: number; first_at: string; last_at: string };

/**
 * 🚧 **진척 0 탐지**(2026-10-17) — "할 일이 남았는데 처리 0건"을 지문과 **무관하게** 잡는다.
 *
 * 왜 detectStuck으로는 안 되는가(실측):
 *   지문(fingerprint)에 큐 크기(remain)가 섞여 있다. cron-embed의 원장을 보면
 *     20:02 임베딩 0 남음 5034 · 08:07 임베딩 0 남음 5558 · 12:06 임베딩 0 남음 5611
 *   처리는 계속 0인데 **큐가 늘어나 지문이 매번 달라져** 연속 반복이 성립하지 않는다.
 *   그래서 임베딩이 며칠째 0건이어도 detectStuck이 0건을 반환했고(ok=true), 공개 파이프라인이
 *   조용히 멈춰 '검증' 등급·후기 100건대 카페가 화면에 안 나왔다(CEO가 "변화 없어"로 발견).
 *
 * 판정: metrics에 처리량(updated|processed)과 잔량(remain)이 있는 런만 본다.
 *   최신 런부터 연속으로 `처리 0 && 잔량 > 0`인 횟수가 minRuns 이상이면 정체.
 *   ⚠️ 잔량 0(할 일 없음)이나 처리 > 0(진척 있음)을 만나면 **즉시 연속이 끊긴다** —
 *      "일이 없어 조용한 것"을 문제로 찍지 않는다(2026-08-10 오탐 수리와 같은 규약).
 *   ⚠️ ok=false(이미 실패로 보고된 런)는 세지 않는다 — 실패는 다른 경로가 이미 올린다.
 */
export async function detectNoProgress(hours = 48, minRuns = 3): Promise<NoProgressJob[]> {
  try {
    await ensure();
    const rows = (await sql`
      SELECT job, ok, metrics, started_at
      FROM run_ledger
      WHERE started_at > now() - (${hours} * interval '1 hour') AND metrics IS NOT NULL
      ORDER BY job, started_at DESC`) as unknown as { job: string; ok: boolean | null; metrics: any; started_at: string }[];
    const out: NoProgressJob[] = [];
    const byJob = new Map<string, typeof rows>();
    for (const r of rows) { const a = byJob.get(r.job) ?? []; a.push(r); byJob.set(r.job, a as any); }
    for (const [job, runs] of byJob) {
      let streak = 0, remain = 0, first = "", last = "";
      for (const r of runs) {                    // 최신 → 과거
        const m = r.metrics ?? {};
        const done = Number(m.updated ?? m.processed ?? NaN);
        const left = Number(m.remain ?? NaN);
        if (!Number.isFinite(done) || !Number.isFinite(left)) break; // 계량 없는 런은 판정 불가
        if (r.ok === false) break;                                   // 이미 실패로 보고됨
        if (left <= 0 || done > 0) break;                            // 할 일 없음 또는 진척 있음 → 연속 끊김
        streak++; remain = left; last = last || r.started_at; first = r.started_at;
      }
      if (streak >= minRuns) out.push({ job, runs: streak, remain, first_at: first, last_at: last });
    }
    return out.sort((a, b) => b.runs - a.runs);
  } catch { return []; }
}

/** 보존기간 정리 — cron-costwatch가 하루 1회 호출(행 수천 개 수준이라 부하 무시 가능). */
export async function pruneLedger(days = 90): Promise<number> {
  try {
    await ensure();
    const r = (await sql`DELETE FROM run_ledger WHERE started_at < now() - (${days} * interval '1 day') RETURNING id`) as any[];
    return r.length;
  } catch { return 0; }
}
