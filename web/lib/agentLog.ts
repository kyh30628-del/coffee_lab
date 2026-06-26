import { sql } from "./db";

// 에이전트(cron) 실행 로그 — agent_runs에 job별 최신 1행(upsert). 관제탑 모니터링 사각지대 제거.
//   side-effect 타임스탬프(synth_updated 등)에 의존하던 것을 명시 로그로 보완: 잡이 일을 하기 전에 죽어도 ok=false로 잡힘.
export async function recordRun(job: string, ok: boolean, detail = "", processed = 0): Promise<void> {
  try {
    await sql`CREATE TABLE IF NOT EXISTS agent_runs (job TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now(), ok BOOLEAN DEFAULT true, detail TEXT, processed INT DEFAULT 0)`;
    await sql`INSERT INTO agent_runs (job, ran_at, ok, detail, processed) VALUES (${job}, now(), ${ok}, ${String(detail).slice(0, 200)}, ${processed})
      ON CONFLICT (job) DO UPDATE SET ran_at = now(), ok = ${ok}, detail = ${String(detail).slice(0, 200)}, processed = ${processed}`;
  } catch { /* 로깅 실패가 잡 자체를 깨지 않게 */ }
}
