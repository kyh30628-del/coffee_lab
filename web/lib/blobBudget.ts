import { sql } from "./db";
import { getContract } from "./jobContract";
import { teamOf } from "./jobTeams";

// 💰 큰 컬럼(blob) 예산 계량기 — 하네스 L1의 집행 장치.
//
// 왜 필요한가: 2026-08-03 Neon 청구 3배 사고의 원인은 `synth_reviews_all`(큰 JSONB)을 13,000곳
//   8회 통째 스캔한 것이었고, **사후에 손으로 추적**해야 알 수 있었다. 잡이 자기 소비량을 세지 않기 때문이다.
//
// 설계
//   · 큰 컬럼을 읽는 **단일 통로**(loadRaw 등)에서만 계량한다 — 전 SQL을 가로채지 않는다(취약·과설계).
//   · 지금은 **관측 모드**: 초과해도 막지 않고 세기만 한다. 원장(run_ledger.metrics.blobReads)에 남아
//     "누가 얼마나 읽는지"가 먼저 드러난 뒤에 경고→강제로 올린다(3단 완화).
//   · 서버리스 웜 인스턴스에서 카운터가 누적되지 않도록 잡 실행 진입점에서 반드시 리셋한다.

type RunState = { job: string; blobReads: number; startedAt: number; overWarned: boolean };
// ⚠️ 2026-08-13 수리: 처음엔 `let cur` 모듈 전역이었다. Vercel Fluid는 **동시 요청이 같은 인스턴스를
//   공유**하므로, cron-resynth(12:02)와 cron-sentinel(12:02)이 겹치면 나중에 startJobRun한 잡이 전역을
//   덮어써 **남의 로드가 내 계정에 찍혔다** — 원장 실측: sentinel blob151 스파이크가 정확히 resynth(150건
//   처리) 동시각에만 발생, sentinel 단독 시각엔 1~3. 가짜 예산경보의 원인.
//   → AsyncLocalStorage로 요청(비동기 체인)별 격리. enterWith라 기존 호출부 API는 그대로다.
import { AsyncLocalStorage } from "node:async_hooks";
const als = new AsyncLocalStorage<RunState>();
const cur = (): RunState | null => als.getStore() ?? null;

/** 잡 실행 진입점에서 호출 — 이 요청의 비동기 체인에 전용 카운터를 심는다(동시 잡과 격리). */
export function startJobRun(job: string): void {
  als.enterWith({ job, blobReads: 0, startedAt: Date.now(), overWarned: false });
}

/** 큰 컬럼 1회 로드를 계량. 통로 밖(계약 없는 임의 쿼리)에서는 세지 않는다. */
export function tickBlob(n = 1): void {
  const c = cur();
  if (!c) return;
  c.blobReads += n;
  const limit = getContract(c.job).budget.blobReads;
  if (limit !== undefined && c.blobReads > limit && !c.overWarned) {
    c.overWarned = true;
    console.warn(`[blobBudget] ${c.job}: 큰 컬럼 로드 ${c.blobReads}회 > 예산 ${limit}회`);
    // ⚠️ **경고 모드**(2026-08-08 승격, 3단 완화의 2단계) — 실행은 막지 않되 **RM 보드에 올린다.**
    //   기존 인프라 재사용: recordRun이 크론 실패를 올릴 때 쓰는 것과 같은 issues 업서트 패턴(새 채널 없음).
    //   🔴 여기서 decisions(결재)를 만들지 않는다 — lib/issues.ts 동결영역(이슈↔결재 자동변환 금지) 불가침.
    void reportOverBudget(c.job, c.blobReads, limit);
  }
}

/** 현재 런의 소비량 — recordRun의 metrics로 넘겨 원장에 남긴다. */
export function runUsage(): { job: string; blobReads: number; wallMs: number; overBudget: boolean } | null {
  const c = cur();
  if (!c) return null;
  const limit = getContract(c.job).budget.blobReads;
  return {
    job: c.job,
    blobReads: c.blobReads,
    wallMs: Date.now() - c.startedAt,
    overBudget: limit !== undefined && c.blobReads > limit,
  };
}

/** 예산 초과를 RM 보드에 기록(경고 모드). 실행은 막지 않는다. 기록 실패는 조용히 무시. */
async function reportOverBudget(job: string, used: number, limit: number): Promise<void> {
  try {
    await sql`INSERT INTO issues (ikey, source, severity, type, title, detail, team, status, state, note, first_seen, last_seen)
      VALUES (${`budget:${job}`}, '하네스', 'HIGH', '예산 초과', ${`${job} 큰 컬럼 예산 초과`},
              ${`큰 컬럼 로드 ${used}회 > 계약 예산 ${limit}회 — 실행은 계속됨(경고 모드)`},
              ${teamOf(job)}, 'open', '처리중', '하네스 L1 예산 계량', now(), now())
      ON CONFLICT (ikey) DO UPDATE SET status='open', severity='HIGH', detail=EXCLUDED.detail, last_seen=now(), state='처리중', resolved_at=NULL`;
  } catch { /* issues 테이블 미존재 등 — 원장 metrics가 백스톱 */ }
}

/** 예산 안에서 끝났으면 기존 경고를 해소(자동 회복 — cronfail과 같은 패턴). */
export async function clearOverBudget(job: string): Promise<void> {
  try { await sql`UPDATE issues SET status='resolved', resolved_at=now() WHERE ikey=${`budget:${job}`} AND status='open'`; } catch { /* graceful */ }
}

/**
 * 🪟 창(window) 총량 예산 — 하네스 L1 보완.
 *   런당 예산만으론 "조금씩 자주"를 못 막는다(2026-07 유튜브 백필이 정확히 그 형태로 전송 663GB를 냈다).
 *   최근 N시간 누적 blob 로드가 상한을 넘으면 이번 런은 무거운 작업을 **스스로 건너뛴다**.
 *   ⚠️ 조회는 원장 집계 1회(작은 숫자만). 실패 시 막지 않는다(가용성 우선).
 */
export async function windowBudgetExceeded(job: string, hours = 24, limit = 400): Promise<boolean> {
  try {
    const r = (await sql`SELECT COALESCE(SUM((metrics->>'blobReads')::int), 0)::int AS n
      FROM run_ledger WHERE job = ${job} AND started_at > now() - (${hours} * interval '1 hour')`)[0] as any;
    const used = Number(r?.n ?? 0);
    if (used > limit) { console.warn(`[blobBudget] ${job}: 최근 ${hours}h 누적 ${used} > 창 예산 ${limit} — 이번 런 스킵`); return true; }
    return false;
  } catch { return false; }
}
