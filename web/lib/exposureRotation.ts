// 🔁 공정 노출 — 피크타임 균등 로테이션 (CEO 확정 방향 2026-07-04)
//   구독 노출 슬롯은 "다 같은 돈 낸 자리"라 리뷰 수와 무관하게 똑같이 나눈다.
//   손님이 몰리는 피크 시간엔 짧은 슬라이스로 자주 회전 → 프라임타임(상단 자리 포함)을 모두가 균등히 나눔.
//   비피크엔 느리게 회전. 결정론(시계만 사용) — 경매·LLM 없음. 노력은 오가닉 순위·클릭 전환으로 보상(이 함수 밖).
//
//   ⚠️ 측정 먼저: 아래 피크 구간은 '일반 카페 이용 패턴' 기반의 합리적 기본값이다.
//   실제 소비자 트래픽이 쌓이면 promo_daily 시간대 분포로 재튜닝할 것(빨강 지표로 단정 금지).

const KST_OFFSET_MIN = 9 * 60; // KST = UTC+9 (DST 없음)
const ROTATE_SLICE_MIN = 20;   // 20분마다 순번 1칸 회전 — '계속 도는' 체감. 고정이라 모든 시간대에 균등.

export type PeakInfo = { isPeak: boolean; dow: number; minuteOfDay: number };

// now(ms, UTC) → KST 기준 피크 여부·요일·분. 회전은 항상 균등하고, 피크는 '언제 균등이 가장 중요한지'의 정보용
// (예: 향후 성과 리포트·튜닝). 결정론(주입 가능).
export function peakInfo(now: number = Date.now()): PeakInfo {
  const kstMin = Math.floor(now / 60000) + KST_OFFSET_MIN;
  const minuteOfDay = ((kstMin % 1440) + 1440) % 1440;
  const dayIndex = Math.floor(kstMin / 1440);
  const dow = ((dayIndex % 7) + 7 + 4) % 7; // 1970-01-01=목(4). 0=일 … 6=토
  const weekend = dow === 0 || dow === 6;
  // 피크 구간(KST): 평일 점심 11:30–14:00 + 저녁 18:00–22:00 / 주말 12:00–20:00 (합리적 기본값 — 실측 후 튜닝)
  const inWeekdayPeak = (minuteOfDay >= 690 && minuteOfDay < 840) || (minuteOfDay >= 1080 && minuteOfDay < 1320);
  const inWeekendPeak = minuteOfDay >= 720 && minuteOfDay < 1200;
  return { isPeak: weekend ? inWeekendPeak : inWeekdayPeak, dow, minuteOfDay };
}

// 구독 카페 pool을 균등 순번으로 회전시켜 상위 cap개를 노출.
//  - 리뷰 수 편향 제거: 중립 기준(id)으로 안정 정렬 후 20분 슬라이스로 오프셋 1칸씩 회전.
//  - 슬라이스가 고정이라 카운터가 1씩 증가 → 어떤 연속 구간에서도 상단(프리미엄) 자리가 정확히 균등.
//  - 한 사이클(N 슬라이스=N×20분) 동안 모든 카페가 모든 자리를 똑같이 거친다.
//  - N ≤ cap이면 전원 상시 노출되지만 '순서(상단 프리미엄)'는 매 슬라이스 공평히 교대.
//  - 피크엔 트래픽이 많아 20분마다 도는 회전이 그대로 '프라임타임 균등 배분'이 된다.
export function rotateFeatured<T extends { id: number | string }>(
  pool: T[],
  cap: number,
  now: number = Date.now(),
): T[] {
  const n = pool.length;
  if (n === 0) return [];
  const base = [...pool].sort((a, b) => Number(a.id) - Number(b.id)); // 중립·안정 기준
  const slice = Math.floor((Math.floor(now / 60000) + KST_OFFSET_MIN) / ROTATE_SLICE_MIN);
  const off = ((slice % n) + n) % n;
  return [...base.slice(off), ...base.slice(0, off)].slice(0, cap);
}
