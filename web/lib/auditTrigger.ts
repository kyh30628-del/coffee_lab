import { sql } from "./db";

// 🔔 이벤트형 자율진단 트리거 — 결정론이 '자동해결 못하고 *판단*이 필요한' 이산 이벤트가 생기면 여기에 적재.
//   로컬 watcher(launchd, 15분)가 pending을 폴해서 self-audit LLM을 *그 자리에서* 깨운다.
//   ⚠️ 구조 제약: 구독토큰은 백엔드 금지(약관) → 서버는 '신호'만 남기고, LLM 실행은 로컬에서. 서버가 로컬을 직접 못 깨움.
//   idle(트리거 0)일 땐 watcher가 DB 한 번만 보고 끝 → LLM 호출 0 = 사실상 공짜. LLM은 *이벤트가 있을 때만* 점화.

export async function ensureTriggers(): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS audit_triggers (
    id SERIAL PRIMARY KEY, kind TEXT, ref TEXT, detail TEXT, severity TEXT DEFAULT 'HIGH',
    status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now(), consumed_at TIMESTAMPTZ
  )`.catch(() => {});
}

// 같은 (kind, ref)가 이미 pending이면 쌓지 않는다(디바운스). 이산 이벤트만 — 폴링성 반복 신호는 넣지 마라.
export async function pushTrigger(kind: string, ref: string, detail = "", severity = "HIGH"): Promise<void> {
  try {
    await ensureTriggers();
    const dup = (await sql`SELECT 1 FROM audit_triggers WHERE kind=${kind} AND ref=${ref} AND status='pending' LIMIT 1`) as any[];
    if (!dup.length) {
      await sql`INSERT INTO audit_triggers (kind, ref, detail, severity) VALUES (${kind}, ${ref}, ${String(detail).slice(0, 200)}, ${severity})`;
    }
  } catch { /* graceful — 트리거 실패가 본 작업을 깨지 않게 */ }
}
