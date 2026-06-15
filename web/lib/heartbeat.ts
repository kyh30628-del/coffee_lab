import { sql } from "./db";

// 로컬 배치(launchd)들이 실행 결과를 DB에 남겨, Vercel 관제탑이 '로컬 작업 건강'을 볼 수 있게 하는 다리.
// 관제탑은 /tmp 로그를 못 보므로, 에러·성공을 여기 기록해야 잡아서 알릴 수 있다.
export async function ensureRuns(): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS agent_runs (job TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now(), ok BOOLEAN DEFAULT true, detail TEXT, processed INT DEFAULT 0)`.catch(() => {});
}

export async function recordRun(job: string, ok: boolean, detail = "", processed = 0): Promise<void> {
  try {
    await ensureRuns();
    const d = (detail || "").replace(/\s+/g, " ").slice(0, 400);
    await sql`INSERT INTO agent_runs (job, ran_at, ok, detail, processed) VALUES (${job}, now(), ${ok}, ${d}, ${processed})
      ON CONFLICT (job) DO UPDATE SET ran_at = now(), ok = ${ok}, detail = ${d}, processed = ${processed}`;
  } catch { /* 하트비트 실패는 본 작업을 방해하지 않도록 무시 */ }
}

// 스크립트 상단에서 호출 → 잡히지 않은 에러도 관제탑이 보게 기록(예: ReferenceError 등 크래시).
export function guardJob(job: string): void {
  const fail = (kind: string) => (e: unknown) => { recordRun(job, false, `${kind}: ${String((e as any)?.stack || e)}`).finally(() => process.exit(1)); };
  process.on("uncaughtException", fail("uncaught"));
  process.on("unhandledRejection", fail("rejection"));
}
