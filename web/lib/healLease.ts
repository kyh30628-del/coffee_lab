import { sql } from "./db";

// 🎫 배차 리스(Lease) — 하네스 L2.
//
// 왜 필요한가: 지금 **같은 카페를 여러 경로가 동시에 재합성**할 수 있다.
//   · cron-sentinel 힐러 6종(각각 최대 12곳)
//   · lib/issues.autoCorrect 결정론 해결기 4종(cron-issues 10분 + cron-synth + 대시보드 로드마다)
//   · cron-resynth 전수 적용
//   4창 클러스터(UTC 3·7·11·23)에 이들이 몰려 있어 겹칠 창이 실제로 존재한다.
//   코드 작업 라인엔 이미 배차 격리가 있다(dev-claim의 SKIP LOCKED + git worktree + 전역 락).
//   **데이터 작업 라인엔 없었다** — 이게 L2의 공백이었다.
//
// 설계
//   · 원자적 획득: `INSERT … ON CONFLICT DO UPDATE … WHERE lease_until < now()` 한 문장(경합 안전).
//   · **TTL 필수** — 소유자가 죽어도 자동 회수된다(전역 mkdir 락 누수 사고의 교훈을 그대로 적용).
//   · 실패는 조용히 `false` — 리스를 못 얻으면 이번 런은 그 대상을 건너뛰고 다음 런이 처리한다.
//   · 리스 획득 실패는 **에러가 아니다**(정상적 양보).

let ensured = false;
async function ensure(): Promise<void> {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS heal_leases (
    target_id INT PRIMARY KEY,
    holder TEXT NOT NULL,
    acquired_at TIMESTAMPTZ DEFAULT now(),
    lease_until TIMESTAMPTZ NOT NULL
  )`.catch(() => {});
  ensured = true;
}

/**
 * 카페 1곳에 대한 데이터 변경 권한을 얻는다.
 * @returns true면 이번 런이 이 카페를 만져도 된다. false면 다른 잡이 잡고 있으니 **양보**한다.
 */
export async function acquireLease(holder: string, targetId: number, ttlSec = 180): Promise<boolean> {
  try {
    await ensure();
    const r = (await sql`INSERT INTO heal_leases (target_id, holder, acquired_at, lease_until)
      VALUES (${targetId}, ${holder}, now(), now() + (${ttlSec} * interval '1 second'))
      ON CONFLICT (target_id) DO UPDATE
        SET holder = ${holder}, acquired_at = now(), lease_until = now() + (${ttlSec} * interval '1 second')
        WHERE heal_leases.lease_until < now()   -- 만료된 리스만 뺏는다(살아있는 소유자는 침범 금지)
      RETURNING target_id`) as any[];
    return r.length > 0;
  } catch { return true; } // 리스 테이블 장애가 치유 자체를 막지 않게(가용성 우선)
}

/** 작업이 끝나면 즉시 반납 — TTL을 기다리지 않아 다음 잡이 바로 쓸 수 있다. */
export async function releaseLease(holder: string, targetId: number): Promise<void> {
  try {
    await ensure();
    await sql`DELETE FROM heal_leases WHERE target_id = ${targetId} AND holder = ${holder}`;
  } catch { /* graceful */ }
}

/** 만료 리스 청소(백스톱) — 소유자가 크래시해도 TTL로 이미 무효지만, 행 자체를 주기적으로 지운다. */
export async function pruneLeases(): Promise<number> {
  try {
    await ensure();
    const r = (await sql`DELETE FROM heal_leases WHERE lease_until < now() - interval '1 hour' RETURNING target_id`) as any[];
    return r.length;
  } catch { return 0; }
}

/** 현재 살아있는 리스 수(관제·보고용). */
export async function activeLeases(): Promise<number> {
  try {
    await ensure();
    const r = (await sql`SELECT COUNT(*)::int n FROM heal_leases WHERE lease_until > now()`)[0] as any;
    return Number(r?.n ?? 0);
  } catch { return 0; }
}
