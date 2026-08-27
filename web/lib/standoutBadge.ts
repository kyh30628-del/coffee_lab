// 🏅 "이 집만의 한 가지" — 동네 안 상대 비교로 카페별 구별점을 뽑는다. (2026-08-21 실측 → 08-22 신설)
//
// 왜 필요한가 — 실측 진단:
//   테마 페이지가 첫 착지의 **83.2%**인데 **45.4%가 1페이지에서 이탈**한다(14일 1,266명 중 574명).
//   원인은 카드 30개가 전부 `등급 + 후기수 + 한줄소개`로 **똑같아 보여** 고를 근거가 없다는 것.
//
// ⚠️ 왜 '절대 점수'가 아니라 '동네 평균 대비'인가 — 이것도 실측으로 정했다:
//   절대 임계(예: space>=3)로 거르면 카공 카페 2,041곳 중 space 96%·mood 96%·dessert 93%가 걸린다.
//   전부 해당되니 아무것도 구별 못 한다(마포 카공 129곳 → '넓은공간' 123곳). 필터로는 못 쓴다.
//   → 같은 동네·같은 테마 안에서 **평균보다 두드러진 축**을 고르면 실제로 갈린다
//     (마포 12곳 실측: 분위기4·넓은공간3·디저트2·조용1·로스팅1·뷰1로 분산, 강도 +5~186%p).
//
// 비용: 이미 받아온 char_scores/synth_count로 계산하는 순수함수. 추가 조회·LLM 0.

export type Standout = { key: string; label: string; emoji: string; lift: number };

const AXES: { key: string; label: string; emoji: string }[] = [
  { key: "quiet", label: "조용", emoji: "🤍" },
  { key: "space", label: "넓은 공간", emoji: "🪑" },
  { key: "dessert", label: "디저트", emoji: "🍰" },
  { key: "mood", label: "분위기", emoji: "📸" },
  { key: "roast", label: "직접 로스팅", emoji: "🔥" },
  { key: "view", label: "뷰", emoji: "🌄" },
  { key: "pet", label: "애견동반", emoji: "🐶" },
  { key: "brunch", label: "브런치", emoji: "🥐" },
  { key: "bakery", label: "베이커리", emoji: "🥖" },
  { key: "terrace", label: "테라스", emoji: "🌿" },
];

type Row = { char_scores?: any; count?: number | null; tasteHits?: number | null };
const rate = (r: Row, k: string): number => {
  const n = Number(r?.count) || 0;
  if (n <= 0) return 0;
  return (Number(r?.char_scores?.[k]) || 0) / n;
};

/**
 * 목록 전체를 받아 각 카페의 '두드러진 축'을 계산한다.
 * @param rows      같은 화면에 함께 보이는 카페들(= 비교 모집단). 동네·테마가 이미 같다.
 * @param excludeKey 이 화면의 주제 축(예: 카공 페이지면 'work') — 전원 해당이라 구별점이 못 된다.
 * @param minLift   평균 대비 최소 격차(기본 0.05 = 5%p). 미달이면 뱃지를 달지 않는다(억지 라벨 금지).
 * @returns rows와 같은 순서의 배열(해당 없으면 null)
 */
export function standoutBadges(rows: Row[], excludeKey?: string, minLift = 0.05): (Standout | null)[] {
  if (!Array.isArray(rows) || rows.length < 3) return rows.map(() => null); // 표본 3곳 미만이면 '평균' 자체가 무의미
  const axes = AXES.filter((a) => a.key !== excludeKey);
  const avg: Record<string, number> = {};
  for (const a of axes) avg[a.key] = rows.reduce((s, r) => s + rate(r, a.key), 0) / rows.length;
  return rows.map((r) => {
    let best: Standout | null = null;
    for (const a of axes) {
      const lift = rate(r, a.key) - avg[a.key];
      if (lift >= minLift && (!best || lift > best.lift)) best = { key: a.key, label: a.label, emoji: a.emoji, lift };
    }
    return best;
  });
}
