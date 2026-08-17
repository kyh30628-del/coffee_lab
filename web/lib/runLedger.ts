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

/** 원장에 1행 추가. 실패해도 조용히 넘어간다(본 작업 보호). */
export async function recordLedger(job: string, r: {
  ok?: boolean; effectOk?: boolean | null; fingerprint?: string;
  metrics?: RunMetrics; detail?: string; startedAt?: Date;
}): Promise<void> {
  try {
    await ensure();
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

/** 보존기간 정리 — cron-costwatch가 하루 1회 호출(행 수천 개 수준이라 부하 무시 가능). */
export async function pruneLedger(days = 90): Promise<number> {
  try {
    await ensure();
    const r = (await sql`DELETE FROM run_ledger WHERE started_at < now() - (${days} * interval '1 day') RETURNING id`) as any[];
    return r.length;
  } catch { return 0; }
}
