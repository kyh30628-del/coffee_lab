import { sql } from "./db";
import { OUT_OF_SCOPE_SQL, geoBoxSql } from "./serviceScope";
import { loadCriteria, getCriterionSync } from "./criteria";
import { enqueueRecheck } from "./recheckQueue";
import { isNonCafe, isFranchise, isSnackStall, isStructuralPhantom, isUnmannedCafe } from "./discover";

// ♻️ 정책 소급 재판정 트리거 — 하네스 L6.
//
// 문제(2026-08-08 실증): `excluded`는 자기유지(`excluded = pst==='excluded' || …`)라
//   **정책이 완화돼도 이미 걸린 곳은 영원히 안 풀린다.** CEO가 8/1에 "제빵소류는 항상 유지"로
//   기준을 완화했는데 우리밀빵꿈터(검증 209건)는 6주간 갇혀 있었고, 사람이 손으로 찾아야 했다.
//
// 설계
//   · 자기유지 구조는 **바꾸지 않는다**(사람만 해제 = 대량 오공개 방지 장치).
//   · 대신 "현재 규칙으로 다시 보면 제외 사유가 없는" 곳을 **사람이 볼 목록**으로 만든다.
//   · 🔴 **자동 재공개 없음.** 8/8 육안검증에서 7곳 중 5곳이 탈락했다(비수도권 주소 3·교차오염 2).
//
// 비용 규율
//   · 정책 변경이 **없으면 쿼리 0회**(먼저 이력만 확인하고 끝낸다).
//   · 재판정은 **작은 컬럼만**(이름·카테고리·등급·좌표). 후기 본문 미조회.
//   · 배치 상한 200곳.

const MAX_BATCH = 200;

/** 마지막 재판정 이후 정책이 바뀌었나 — 값 기준(criteria)·사전 기준(criteria_lists) 둘 다 본다. */
async function lastPolicyChange(): Promise<{ at: Date | null; ref: string }> {
  try {
    const r = (await sql`
      SELECT MAX(t) AS at, MAX(ref) AS ref FROM (
        SELECT changed_at AS t, 'criteria#' || id::text AS ref FROM criteria_history
        UNION ALL
        SELECT at AS t, 'list#' || id::text AS ref FROM criteria_list_history
      ) x`)[0] as any;
    return { at: r?.at ? new Date(r.at) : null, ref: String(r?.ref ?? "") };
  } catch { return { at: null, ref: "" }; }
}

/**
 * 정책 변경이 있었으면, excluded 중 **현재 규칙상 제외 사유가 사라진 곳**을 큐에 적재한다.
 * @param sinceHours 이 시간 안에 정책이 바뀌었을 때만 동작(크론 주기와 맞춘다)
 */
export async function runRecheckTrigger(sinceHours = 26): Promise<{ policyChanged: boolean; scanned: number; queued: number; ref: string }> {
  const { at, ref } = await lastPolicyChange();
  if (!at || Date.now() - at.getTime() > sinceHours * 3600_000) {
    return { policyChanged: false, scanned: 0, queued: 0, ref }; // 변경 없음 → 여기서 끝(추가 쿼리 0)
  }
  // 작은 컬럼만. 등급이 서는 excluded만 본다(등급 미달은 어차피 공개 불가라 볼 필요 없음).
  // ⚠️ 주소 시·도 필터 필수(2026-08-08 육안검증 교훈): 좌표 박스만으로는 경계지역을 못 거른다.
  //    재공개 후보 7곳 중 3곳이 **area는 수도권인데 실제 주소가 비수도권**이었다(로드1950=충남 당진,
  //    한탄강빵명장=강원 철원, 월송유로=강원 춘천). 이걸 안 거르면 큐가 소음으로 채워진다.
  // 🚨 2026-08-26: 좌표 박스와 시·도 목록이 둘 다 하드코딩이라 **강원이 재공개 후보에서 영영 빠졌다**.
  //   범위가 바뀌면 여기만 뒤처져 정상 카페가 복구되지 않는다 → criteria·serviceScope 단일출처로 교정.
  await loadCriteria();
  const rows = (await sql.query(`SELECT id, name, naver_category cat, synth_grade g
    FROM cafes
    WHERE NOT published AND pipeline_status = 'excluded'
      AND synth_grade IN ('검증','참고')
      AND lat IS NOT NULL AND ${geoBoxSql(getCriterionSync)}
      AND NOT (${OUT_OF_SCOPE_SQL})
      AND COALESCE(offctx_rate, 0) < 0.2
      AND id NOT IN (SELECT cafe_id FROM recheck_queue WHERE reviewed_at IS NULL)
    LIMIT 2000`).catch(() => [])) as any[];

  const cand: { cafeId: number; reason: string; policyRef: string }[] = [];
  for (const c of rows) {
    const name = String(c.name || ""), cat = String(c.cat || "");
    // 현재 규칙으로 다시 판정 — 하나라도 걸리면 제외가 여전히 맞다.
    if (isSnackStall(name) || isStructuralPhantom(name) || isUnmannedCafe(name) || isNonCafe(name, cat) || isFranchise(name)) continue;
    cand.push({ cafeId: Number(c.id), reason: `정책 변경 후 재판정 — 현재 규칙상 제외 사유 없음(${c.g})`, policyRef: ref });
    if (cand.length >= MAX_BATCH) break;
  }
  const queued = await enqueueRecheck(cand);
  return { policyChanged: true, scanned: rows.length, queued, ref };
}
