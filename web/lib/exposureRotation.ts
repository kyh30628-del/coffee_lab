// 🔁 공정 노출 — 피크타임 균등 로테이션 (CEO 확정 방향 2026-07-04)
//   구독 노출 슬롯은 "다 같은 돈 낸 자리"라 리뷰 수와 무관하게 똑같이 나눈다.
//   손님이 몰리는 피크 시간엔 짧은 슬라이스로 자주 회전 → 프라임타임(상단 자리 포함)을 모두가 균등히 나눔.
//   비피크엔 느리게 회전. 결정론(시계만 사용) — 경매·LLM 없음. 노력은 오가닉 순위·클릭 전환으로 보상(이 함수 밖).
//
//   ⚠️ 측정 먼저: 아래 피크 구간은 '일반 카페 이용 패턴' 기반의 합리적 기본값이다.
//   실제 소비자 트래픽이 쌓이면 promo_daily 시간대 분포로 재튜닝할 것(빨강 지표로 단정 금지).

const KST_OFFSET_MIN = 9 * 60; // KST = UTC+9 (DST 없음)
const ROTATE_SLICE_MIN = 20;   // 20분마다 순번 1칸 회전 — 피크·비피크 상시 균등하게 '계속 도는' 체감.
const PEAK_START_MIN = 9 * 60;  // 피크 09:00 KST
const PEAK_END_MIN = 17 * 60;   // 피크 17:00 KST (CEO 지정 2026-07-04)

export type PeakInfo = { isPeak: boolean; dow: number; minuteOfDay: number };

// now(ms, UTC) → KST 기준 피크(09~17시) 여부·요일·분. 회전은 상시 균등하고, isPeak은 성과 리포트·튜닝 정보용.
export function peakInfo(now: number = Date.now()): PeakInfo {
  const kstMin = Math.floor(now / 60000) + KST_OFFSET_MIN;
  const minuteOfDay = ((kstMin % 1440) + 1440) % 1440;
  const dayIndex = Math.floor(kstMin / 1440);
  const dow = ((dayIndex % 7) + 7 + 4) % 7; // 1970-01-01=목(4). 0=일 … 6=토
  return { isPeak: minuteOfDay >= PEAK_START_MIN && minuteOfDay < PEAK_END_MIN, dow, minuteOfDay };
}

// 구독 카페 pool을 균등 순번으로 회전시켜 상위 cap개를 노출. (호출부가 scope=전체 또는 구·군으로 pool을 넘김
//  → 전체 뷰·구/군 뷰 각각 독립적으로 공정하게 돈다.)
//  - 리뷰 수 편향 제거: 중립 기준(id) 안정 정렬 후 회전.
//  - 하루를 20분 슬라이스(0~71)로 나눠 1칸씩 회전 → 피크(09~17시)든 나머지 시간이든 상시 균등.
//    피크 24슬라이스는 매일 모든 카페에 ~균등(±1)하게 쪼개지고, 비피크에도 계속 돌아 아무도 자리에 박히지 않음.
//  - + dayIndex 위상 이동: 매일 시작 자리를 1칸씩 밀어 '9시 오픈(프리미엄) 자리'를 특정 카페가 독점하지 못하게
//    (N일이면 모든 카페가 오픈 자리를 한 번씩 — N과 무관하게 보장).
//  - N ≤ cap이면 전원 상시 노출되되 '순서(상단 프리미엄)'가 공평히 교대. N > cap이면 노출 자체가 균등 회전.
export function rotateFeatured<T extends { id: number | string }>(
  pool: T[],
  cap: number,
  now: number = Date.now(),
): T[] {
  const n = pool.length;
  if (n === 0) return [];
  const base = [...pool].sort((a, b) => Number(a.id) - Number(b.id)); // 중립·안정 기준
  const kstMin = Math.floor(now / 60000) + KST_OFFSET_MIN;
  const minuteOfDay = ((kstMin % 1440) + 1440) % 1440;
  const dayIndex = Math.floor(kstMin / 1440);
  const sliceOfDay = Math.floor(minuteOfDay / ROTATE_SLICE_MIN); // 0~71
  const off = (((sliceOfDay + dayIndex) % n) + n) % n;           // 20분 회전 + 매일 위상 1칸
  return [...base.slice(off), ...base.slice(0, off)].slice(0, cap);
}
