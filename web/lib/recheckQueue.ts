import { sql } from "./db";

// ♻️ 정책 소급 재판정 큐 — 하네스 L6.
//
// 왜 필요한가(2026-08-08 실증): CEO가 8/1에 "빵·베이커리·제과·제빵소류는 항상 유지"로 기준을 완화했는데,
//   이미 `excluded`로 찍힌 곳은 **소급되지 않아** 우리밀빵꿈터(검증 209건)가 6주간 갇혀 있었다.
//   `excluded = pipeline_status==='excluded' || …` 라 **자기유지**되기 때문이다.
//
// 설계 결정
//   · 자기유지 구조는 **바꾸지 않는다** — "사람만 해제"는 의도된 안전장치다(대량 오공개 방지).
//   · 대신 옆에 큐를 단다: 정책이 바뀌면 영향권을 **사람이 볼 목록**으로 만들어 둔다.
//   · 🔴 **자동 재공개는 절대 없다.** 2026-08-08 육안 검증에서 7곳 중 5곳이 탈락했다
//     (비수도권 주소 3곳=당진·철원·춘천, 교차오염 2곳). 자동 게이트만 믿었으면 5/7을 잘못 공개했다.

let ensured = false;
async function ensure(): Promise<void> {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS recheck_queue (
    id BIGSERIAL PRIMARY KEY,
    cafe_id INT NOT NULL,
    reason TEXT,
    policy_ref TEXT,
    queued_at TIMESTAMPTZ DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    verdict TEXT,          -- keep_excluded | republish | needs_look
    note TEXT
  )`.catch(() => {});
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS recheck_queue_open ON recheck_queue (cafe_id) WHERE reviewed_at IS NULL`.catch(() => {});
  ensured = true;
}

/** 재판정 대상 적재(미검토 중복은 무시). 배치 상한은 호출부가 지킨다. */
export async function enqueueRecheck(items: { cafeId: number; reason: string; policyRef?: string }[]): Promise<number> {
  if (!items.length) return 0;
  try {
    await ensure();
    let n = 0;
    for (const it of items.slice(0, 200)) { // ⚠️ 배치 상한 — 정책 하나가 수천 건을 만들지 않게
      const r = (await sql`INSERT INTO recheck_queue (cafe_id, reason, policy_ref)
        VALUES (${it.cafeId}, ${String(it.reason).slice(0, 200)}, ${it.policyRef ?? null})
        ON CONFLICT DO NOTHING RETURNING id`.catch(() => [])) as any[];
      if (r.length) n++;
    }
    return n;
  } catch { return 0; }
}

export type RecheckItem = { id: number; cafe_id: number; name: string; area: string; grade: string; count: number; reason: string; queued_at: string };

/** 미검토 목록 — 관제 화면·보고서용(작은 컬럼만). */
export async function openRechecks(limit = 50): Promise<RecheckItem[]> {
  try {
    await ensure();
    return (await sql`SELECT q.id, q.cafe_id, c.name, c.area, c.synth_grade grade, c.synth_count count,
        q.reason, (q.queued_at AT TIME ZONE 'Asia/Seoul')::text queued_at
      FROM recheck_queue q JOIN cafes c ON c.id = q.cafe_id
      WHERE q.reviewed_at IS NULL ORDER BY q.id DESC LIMIT ${limit}`) as any[];
  } catch { return []; }
}

/** 사람이 판단한 결과 기록 — 이 함수는 공개 상태를 바꾸지 않는다(집행은 기존 결재 경로로). */
export async function resolveRecheck(id: number, verdict: "keep_excluded" | "republish" | "needs_look", note = ""): Promise<void> {
  try {
    await ensure();
    await sql`UPDATE recheck_queue SET reviewed_at = now(), verdict = ${verdict}, note = ${note.slice(0, 300)} WHERE id = ${id}`;
  } catch { /* graceful */ }
}

export async function openRecheckCount(): Promise<number> {
  try {
    await ensure();
    const r = (await sql`SELECT COUNT(*)::int n FROM recheck_queue WHERE reviewed_at IS NULL`)[0] as any;
    return Number(r?.n ?? 0);
  } catch { return 0; }
}
