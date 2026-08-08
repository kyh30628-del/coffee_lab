import { sql } from "./db";
import { pushTrigger } from "./auditTrigger";

// 🩺 자율 치유 하네스 — 하네스 L4(효과 검증 + 수렴 계약).
//
// 왜 필요한가(2026-08-08 실증): 치유기가 "10곳 고쳤다"고 6회 연속 보고했지만 DB의 synth_updated는
//   8/2~8/4에 멈춰 있었다. 즉 **"호출했다"와 "바뀌었다" 사이에 아무 확인이 없었다.**
//   코드 라인엔 이미 같은 개념이 있다 — `reconcileUnverified`(배포가 진짜 반영됐나). 이건 그 데이터판이다.
//
// 3원칙
//   ① 집행 후 **그 대상만** 재검사한다(전수 재스캔 금지 — 비용).
//   ② 효과가 없으면 `fixed`로 세지 않는다(허위 보고 차단).
//   ③ 같은 대상이 N회 효과 없으면 **동결**하고 사람에게 넘긴다(무한 반복 차단).
//
// ⚠️ 이 모듈은 '조치를 더 세게' 만드는 장치가 아니다. **덜 하게** 만드는 장치다 —
//    못 고치는 건 빨리 포기하고 워치리스트로 올린다.

let ensured = false;
async function ensure(): Promise<void> {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS heal_attempts (
    job TEXT NOT NULL,
    target_id INT NOT NULL,
    attempts INT DEFAULT 0,
    no_effect INT DEFAULT 0,
    last_effect BOOLEAN,
    last_at TIMESTAMPTZ DEFAULT now(),
    frozen_until TIMESTAMPTZ,
    note TEXT,
    PRIMARY KEY (job, target_id)
  )`.catch(() => {});
  ensured = true;
}

export type HealOutcome = {
  attempted: number;   // 시도한 대상 수
  changed: number;     // 실제로 무언가 바뀐 대상 수(집행 결과 기준)
  verified: number;    // 재검사에서 문제가 사라진 대상 수  ← 이것만 '진짜 치유'
  frozen: number;      // 반복 무효로 이번에 동결된 대상 수
  skipped: number;     // 이미 동결돼 건너뛴 대상 수
  names: string[];     // 보고용(최대 8)
};

/** 이미 동결된 대상 id 집합 — 치유기가 시도 전에 걸러낸다(= 헛돎 원천 차단). */
export async function frozenTargets(job: string): Promise<Set<number>> {
  try {
    await ensure();
    const rows = (await sql`SELECT target_id FROM heal_attempts
      WHERE job=${job} AND frozen_until IS NOT NULL AND frozen_until > now()`) as any[];
    return new Set(rows.map((r) => Number(r.target_id))); // Set<number> — 호출부도 Number()로 비교할 것
  } catch { return new Set(); }
}

/**
 * 한 대상의 치유 시도 결과를 기록하고, 수렴 여부를 판정한다.
 * @param effective 재검사 결과 문제가 실제로 사라졌는가
 * @param maxNoEffect 연속 무효 허용 횟수(초과 시 동결)
 * @returns 이번 호출로 동결됐는지
 */
export async function noteAttempt(
  // ⚠️ targetId는 반드시 number로 — cafes.id는 SQL에서 문자열로 오므로 호출부가 Number()를 씌워야 한다.
  //   2026-08-08 실전검증에서 Set<number>.has("7628")이 false가 되어 동결이 무력화된 적이 있다.
  job: string, targetId: number, effective: boolean,
  opts?: { maxNoEffect?: number; freezeDays?: number; note?: string },
): Promise<{ frozen: boolean }> {
  const maxNoEffect = opts?.maxNoEffect ?? 2;
  const freezeDays = opts?.freezeDays ?? 30;
  try {
    await ensure();
    const rows = (await sql`INSERT INTO heal_attempts (job, target_id, attempts, no_effect, last_effect, last_at, note)
      VALUES (${job}, ${targetId}, 1, ${effective ? 0 : 1}, ${effective}, now(), ${String(opts?.note ?? "").slice(0, 200)})
      ON CONFLICT (job, target_id) DO UPDATE SET
        attempts = heal_attempts.attempts + 1,
        no_effect = CASE WHEN ${effective} THEN 0 ELSE heal_attempts.no_effect + 1 END,
        last_effect = ${effective},
        last_at = now(),
        note = EXCLUDED.note,
        -- 효과가 나면 동결 해제(다음에 또 오염되면 정상적으로 다시 시도)
        frozen_until = CASE WHEN ${effective} THEN NULL ELSE heal_attempts.frozen_until END
      RETURNING no_effect`) as any[];
    const noEffect = Number(rows[0]?.no_effect ?? 0);
    if (!effective && noEffect >= maxNoEffect) {
      await sql`UPDATE heal_attempts SET frozen_until = now() + (${freezeDays} * interval '1 day')
        WHERE job=${job} AND target_id=${targetId}`.catch(() => {});
      // 자동으로 못 고치는 건 사람 판단 영역 → 신호만 남긴다(디바운스 내장, 결재 자동생성 아님).
      await pushTrigger("heal_no_effect", `${job}#${targetId}`,
        `자동조치 ${noEffect}회 연속 무효 — ${freezeDays}일 동결, 사람 확인 필요`, "HIGH").catch(() => {});
      return { frozen: true };
    }
    return { frozen: false };
  } catch { return { frozen: false }; }
}

/** 동결 현황(관제·보고용). */
export async function frozenSummary(): Promise<{ job: string; n: number }[]> {
  try {
    await ensure();
    return (await sql`SELECT job, COUNT(*)::int n FROM heal_attempts
      WHERE frozen_until IS NOT NULL AND frozen_until > now() GROUP BY job ORDER BY n DESC`) as any[];
  } catch { return []; }
}

/**
 * 치유 효과 판정용 지문 — **탐지기가 보는 바로 그 소스**(`synth_reviews` = 노출 top6)의 해시.
 *   ⚠️ 비용: md5를 **SQL 안에서** 계산해 32자만 전송한다(큰 컬럼을 앱으로 실어오지 않는다).
 *   집행 전후 이 값이 같으면 = 노출이 하나도 안 바뀜 = 효과 없음(2026-08-08 사고의 정확한 모습).
 */
export async function shownHash(cafeId: number): Promise<string> {
  try {
    const r = (await sql`SELECT md5(COALESCE(synth_reviews::text,'')) h FROM cafes WHERE id=${cafeId}`)[0] as any;
    return String(r?.h ?? "");
  } catch { return ""; }
}
