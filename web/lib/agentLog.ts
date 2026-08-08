import { sql } from "./db";
import { pushTrigger } from "./auditTrigger";
import { teamOf } from "./jobTeams"; // 단일 사실 출처(2026-07-02 — 3벌 맵 drift 수리)
import { recordLedger, type RunMetrics } from "./runLedger"; // 📒 하네스 L5 실행 원장

// 에이전트(cron) 실행 로그 — agent_runs에 job별 최신 1행(upsert). 관제탑 모니터링 사각지대 제거.
//   side-effect 타임스탬프(synth_updated 등)에 의존하던 것을 명시 로그로 보완: 잡이 일을 하기 전에 죽어도 ok=false로 잡힘.
export async function recordRun(
  job: string, ok: boolean, detail = "", processed = 0,
  // 📒 하네스 L5(2026-08-08): 실행 '이력'을 남기는 선택 인자. 기존 호출부 28곳은 손대지 않아도 되고,
  //   지문을 넘기는 잡만 정체(헛돎) 탐지 대상이 된다. agent_runs upsert(현재상태)는 그대로 유지.
  extra?: { fingerprint?: string; metrics?: RunMetrics; effectOk?: boolean | null; startedAt?: Date },
): Promise<void> {
  // 원장은 본 작업과 독립 — 실패해도 아래 흐름에 영향 없음(recordLedger 내부 graceful).
  void recordLedger(job, { ok, detail, effectOk: extra?.effectOk ?? null, fingerprint: extra?.fingerprint, metrics: { ...(extra?.metrics ?? {}), processed }, startedAt: extra?.startedAt });
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
      const team = teamOf(job);
      await sql`INSERT INTO issues (ikey, source, severity, type, title, detail, team, status, state, note, first_seen, last_seen)
        VALUES (${ik}, '크론', 'HIGH', '크론 실패', ${`${job} 실패`}, ${String(detail).slice(0, 200)}, ${team}, 'open', '처리중', '실패 즉시 자동감지·본부배정', now(), now())
        ON CONFLICT (ikey) DO UPDATE SET status='open', severity='HIGH', detail=EXCLUDED.detail, team=EXCLUDED.team, last_seen=now(), state='처리중', resolved_at=NULL`;
    } else {
      await sql`UPDATE issues SET status='resolved', resolved_at=now() WHERE ikey=${ik} AND status='open'`;
    }
  } catch { /* issues 테이블 미존재 등 — cron-issues 폴이 백스톱 */ }
  // 🔔 크론 실패 = 판단 필요한 이산 이벤트 → 이벤트형 트리거. 로컬 watcher가 self-audit LLM을 깨워 근본원인 조사.
  //   🚫 두 경우는 트리거 제외(2026-07-02, 자기증폭·폭풍 근본차단):
  //   ① self-audit-agent 자신의 실패 — 트리거 워처가 깨우는 대상이 자기라 '실패→트리거→자기기동→실패' 무한루프(레이트리밋 시 27회 폭풍)를 만든다.
  //   ② 레이트리밋/세션한도 — 계정 전역·일시적이라 LLM을 깨워도 함께 막혀 무의미. 대량 동시실패가 트리거 홍수를 일으킨다.
  //   두 경우 모두 실패 하트비트·이슈는 남겨 가시성은 유지하고, LLM 기동(트리거)만 생략한다.
  const isRateLimit = /session limit|rate limit|hit your (usage|session)|resets \d|한도/i.test(String(detail));
  if (!ok && job !== "self-audit-agent" && !isRateLimit) await pushTrigger("cron_fail", job, detail, "HIGH");
}
