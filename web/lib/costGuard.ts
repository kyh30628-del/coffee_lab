import { sql } from "@/lib/db";

// 🛑 비용 자동 정지 스위치(CEO 지시 2026-08-03: "컴퓨트/전송이 과다로 오르면 작업하지 말고 멈춰").
//   cron-costwatch가 이상(임계 초과)을 감지하면 halted=true로 세우고, 정상으로 돌아오면 자동 해제.
//   무거운 자율 크론(youtube-backfill·sentinel·resynth·grow 등)은 시작 시 isCostHalted()를 확인해 스킵한다.
//   → 데이터전송/컴퓨트를 올리는 작업 자체를 멈춰 청구 급증을 원천 차단.
let ensured = false;
async function ensure() {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS cost_guard (id INT PRIMARY KEY DEFAULT 1, halted BOOLEAN DEFAULT false, reason TEXT, set_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
  ensured = true;
}

// 🔧 job별 개별 halt(decisions#1326, #1290 후속) — 단일 스위치 오탐 1건이 grow·synth·resynth·exposure를
//   동시에 얼리던 SPOF(09-23·09-28 재발)를 분리. 전역(id=1)은 '총량이 임계의 2배 이상 + 원인 미특정'일 때만 쓰고,
//   원인이 특정되면 그 job만 cost_guard_jobs 행으로 멈춘다. 매일 costwatch가 재평가해 자동 해제.
let jobsEnsured = false;
async function ensureJobs() {
  if (jobsEnsured) return;
  await sql`CREATE TABLE IF NOT EXISTS cost_guard_jobs (job TEXT PRIMARY KEY, halted BOOLEAN DEFAULT false, reason TEXT, set_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
  jobsEnsured = true;
}

// 최다 읽기 쿼리 원문(200자)에서 원천 job을 추정 — 각 크론이 주로 건드리는 테이블 지문. 특정 불가면 null.
export function attributeCostJob(querySample: string | null | undefined): string | null {
  const q = String(querySample || "");
  if (/discovery_(state|targets)/i.test(q)) return "cron-grow";
  if (/sentinel_reports|\bFROM\s+pool\b/i.test(q)) return "cron-exposure";
  if (/jsonb_array_elements|UPDATE\s+cafes/i.test(q)) return "cron-resynth";
  return null;
}

// job 지정 시: 전역 정지 OR 그 job 개별 정지. job 없으면 전역만(기존 호출부 호환).
export async function isCostHalted(job?: string): Promise<boolean> {
  try {
    await ensure();
    const r = (await sql`SELECT halted FROM cost_guard WHERE id = 1`)[0] as any;
    if (r?.halted) return true;
    if (!job) return false;
    await ensureJobs();
    const j = (await sql`SELECT halted FROM cost_guard_jobs WHERE job = ${job}`)[0] as any;
    return !!j?.halted;
  } catch { return false; } // 조회 실패 시 막지 않음(가용성 우선)
}

// 개별 halt 집합을 통째로 갱신: halts에 든 job만 정지, 나머지는 해제.
export async function setJobHalts(halts: { job: string; reason: string }[]): Promise<void> {
  try {
    await ensureJobs();
    const jobs = halts.map((h) => h.job);
    await sql`UPDATE cost_guard_jobs SET halted = false, reason = '정상', set_at = now() WHERE halted AND NOT (job = ANY(${jobs}::text[]))`;
    for (const h of halts) {
      await sql`INSERT INTO cost_guard_jobs (job, halted, reason, set_at) VALUES (${h.job}, true, ${h.reason.slice(0, 200)}, now())
        ON CONFLICT (job) DO UPDATE SET halted = true, reason = ${h.reason.slice(0, 200)}, set_at = CASE WHEN cost_guard_jobs.halted THEN cost_guard_jobs.set_at ELSE now() END`;
    }
  } catch { /* 무해 실패 */ }
}

export async function setCostHalt(on: boolean, reason: string): Promise<void> {
  try {
    await ensure();
    await sql`INSERT INTO cost_guard (id, halted, reason, set_at) VALUES (1, ${on}, ${reason.slice(0, 200)}, now())
      ON CONFLICT (id) DO UPDATE SET halted = ${on}, reason = ${reason.slice(0, 200)}, set_at = now()`;
  } catch { /* 무해 실패 */ }
}
