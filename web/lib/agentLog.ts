import { sql } from "./db";
import { pushTrigger } from "./auditTrigger";

// 크론 실패 → 담당 본부 (issues.ts CRON_TEAM과 동기화 — 순환참조 피해 인라인)
const CRONFAIL_TEAM: Record<string, string> = {
  "cron-synth": "운영본부", "cron-resynth": "운영본부", "cron-embed": "운영본부", "cron-snapshot": "운영본부",
  "orchestrator-heal": "품질본부", "cron-sentinel": "품질본부", "cron-verify": "품질본부", "cron-rulegap": "품질본부", "cron-selfaudit": "품질본부", "cron-batch-judge": "품질본부",
  "cron-grow": "성장본부", "cron-demand": "성장본부", "cron-newsletter": "성장본부", "cron-discover-categories": "성장본부", "cafe-collect": "성장본부",
  "cron-closure": "운영본부", "cron-enrich": "운영본부",
  // 로컬 launchd 잡(하트비트 경유) — cron-selfaudit JOB_TEAM과 동기화
  "youtube-backfill": "품질본부", "dong-backfill": "운영본부", "weekly-evaluation": "전략기획본부",
  "chief-manager": "기획조정실", "self-audit": "기획조정실", "audit-watch": "기획조정실", "chat-watch": "경영지원본부",
};

// 에이전트(cron) 실행 로그 — agent_runs에 job별 최신 1행(upsert). 관제탑 모니터링 사각지대 제거.
//   side-effect 타임스탬프(synth_updated 등)에 의존하던 것을 명시 로그로 보완: 잡이 일을 하기 전에 죽어도 ok=false로 잡힘.
export async function recordRun(job: string, ok: boolean, detail = "", processed = 0): Promise<void> {
  try {
    await sql`CREATE TABLE IF NOT EXISTS agent_runs (job TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now(), ok BOOLEAN DEFAULT true, detail TEXT, processed INT DEFAULT 0)`;
    await sql`INSERT INTO agent_runs (job, ran_at, ok, detail, processed) VALUES (${job}, now(), ${ok}, ${String(detail).slice(0, 200)}, ${processed})
      ON CONFLICT (job) DO UPDATE SET ran_at = now(), ok = ${ok}, detail = ${String(detail).slice(0, 200)}, processed = ${processed}`;
  } catch { /* 로깅 실패가 잡 자체를 깨지 않게 */ }
  // 🚨 실패 즉시 이슈화 — 10분 폴 안 기다리고 *실패 기록 그 순간* RM 보드에 올리고 담당 본부 자동 배정.
  //   회복(ok)되면 그 즉시 해소. issues 테이블은 cron-issues가 보장(없으면 graceful 무시).
  try {
    const ik = `cronfail:${job}`;
    if (!ok) {
      const team = CRONFAIL_TEAM[job] || "경영지원본부";
      await sql`INSERT INTO issues (ikey, source, severity, type, title, detail, team, status, state, note, first_seen, last_seen)
        VALUES (${ik}, '크론', 'HIGH', '크론 실패', ${`${job} 실패`}, ${String(detail).slice(0, 200)}, ${team}, 'open', '처리중', '실패 즉시 자동감지·본부배정', now(), now())
        ON CONFLICT (ikey) DO UPDATE SET status='open', severity='HIGH', detail=EXCLUDED.detail, team=EXCLUDED.team, last_seen=now(), state='처리중', resolved_at=NULL`;
    } else {
      await sql`UPDATE issues SET status='resolved', resolved_at=now() WHERE ikey=${ik} AND status='open'`;
    }
  } catch { /* issues 테이블 미존재 등 — cron-issues 폴이 백스톱 */ }
  // 🔔 크론 실패 = 판단 필요한 이산 이벤트 → 이벤트형 트리거. 로컬 watcher가 self-audit LLM을 깨워 근본원인 조사.
  if (!ok) await pushTrigger("cron_fail", job, detail, "HIGH");
}
