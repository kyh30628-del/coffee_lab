// 🔇 조용한 실패 계수기 — "삼킨 오류"를 **동작은 그대로 둔 채 보이게만** 만든다 (2026-08-29 CEO 지시).
//
// 왜 필요한가: 오늘 고덕방(3056)이 38일간 재점검에서 빠졌는데, `catch { gErr++ }`가 이유를 통째로 버려
//   아무도 '왜'를 볼 수 없었다. 그 사이 규칙이 강해졌는데 옛 등급으로 계속 공개됐다(실제 소비자 노출 문제).
//   문제를 만드는 것보다 **문제를 못 보는 게** 위험하다.
//
// 왜 catch를 없애지 않는가: 전수 스캔 결과 삼킨 곳이 500군데인데 대부분은 **정당하다.**
//   예 — 화면에서 분석 전송이 실패해도 사용자의 클릭은 계속돼야 한다. catch를 걷어내면 UX가 깨진다.
//   그래서 "던지게 바꾸기"가 아니라 "**세고 남기기**"를 택한다: 동작 불변, 관측만 추가.
//
// 💰 비용: **실패했을 때만** 쓴다. 정상 동작에서는 추가 쿼리 0.
//   같은 (scope, 날짜)는 한 행으로 누적(ON CONFLICT) — 폭주해도 행이 늘지 않는다.

import { sql } from "./db";

let ensured = false;
async function ensure(): Promise<void> {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS silent_failures (
    scope TEXT NOT NULL,
    day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date,
    n INT NOT NULL DEFAULT 0,
    last_error TEXT,
    last_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (scope, day)
  )`;
  ensured = true;
}

/**
 * 삼킨 실패 1건을 기록한다. **절대 던지지 않는다** — 계수기 자신이 호출부를 깨뜨리면 본말전도다.
 * @param scope 어디서 실패했나(예: "visit.traffic_events", "cron-resynth.synth")
 */
export async function noteSilentFail(scope: string, err: unknown): Promise<void> {
  try {
    await ensure();
    const msg = String(err instanceof Error ? err.message : err).slice(0, 200);
    await sql`INSERT INTO silent_failures (scope, n, last_error, last_at)
      VALUES (${scope.slice(0, 60)}, 1, ${msg}, now())
      ON CONFLICT (scope, day) DO UPDATE
        SET n = silent_failures.n + 1, last_error = EXCLUDED.last_error, last_at = now()`;
  } catch {
    /* 계수기 실패는 무시한다. DB 자체가 죽은 상황이면 어차피 기록할 곳이 없다. */
  }
}

/** 관제탑용 — 오늘·어제 누적 실패. 임계 넘은 것만 넘겨 소음을 만들지 않는다. */
export async function recentSilentFails(minCount = 5): Promise<{ scope: string; n: number; last_error: string }[]> {
  try {
    await ensure();
    return (await sql`SELECT scope, SUM(n)::int n, MAX(last_error) last_error
      FROM silent_failures WHERE day >= (now() AT TIME ZONE 'Asia/Seoul')::date - 1
      GROUP BY scope HAVING SUM(n) >= ${minCount} ORDER BY 2 DESC LIMIT 8`) as unknown as
      { scope: string; n: number; last_error: string }[];
  } catch { return []; }
}
