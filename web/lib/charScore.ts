// 성격 축(char) 키워드 점수 — 합성 경로와 char-compute가 공유하는 단일 출처.
// 검증 통과한 리뷰 텍스트에서만 계산한다(품질 필터 이후). 측정값이 아니라 '언급 빈도'.

export const CHAR_AXES = [
  { key: "roast", label: "직접로스팅", emoji: "🔥", kws: ["로스팅", "로스터리", "직접 볶", "자가배전", "스페셜티", "싱글오리진"] },
  { key: "work", label: "작업·공부", emoji: "💻", kws: ["작업", "노트북", "공부", "콘센트", "집중", "와이파이"] },
  { key: "quiet", label: "조용·혼자", emoji: "🤍", kws: ["조용", "차분", "혼자", "고요", "사색", "한적"] },
  { key: "dessert", label: "디저트", emoji: "🍰", kws: ["디저트", "케이크", "스콘", "크로플", "티라미수", "베이커리", "쿠키", "빵"] },
  { key: "mood", label: "분위기", emoji: "📸", kws: ["분위기", "예쁜", "감성", "인테리어", "사진", "뷰", "루프탑", "아늑"] },
  { key: "space", label: "넓은공간", emoji: "🪑", kws: ["넓", "대형", "규모", "테라스", "주차"] },
];

function countHits(text: string, kws: string[]): number {
  const t = text.toLowerCase();
  return kws.reduce((s, k) => s + (t.split(k.toLowerCase()).length - 1), 0);
}

// 여러 텍스트(검증 리뷰 본문들)에서 축별 언급 횟수 합산.
export function computeCharScores(texts: string[]): Record<string, number> {
  const blob = texts.filter(Boolean).join(" ");
  const scores: Record<string, number> = {};
  for (const ax of CHAR_AXES) scores[ax.key] = countHits(blob, ax.kws);
  return scores;
}

// 디저트/베이커리 우세 카페가 '요즘 뜨는'·'새로 발견' 등 커피 랭킹을 리뷰 회전만으로 과점하는 편향 방지(결함C).
//   dominant: 디저트 언급이 커피축(roast+work+quiet+mood+space) 대비 2배 넘게 두드러지면 커피 랭킹에서 제외.
//   bonus: 반대로 디저트가 커피축을 넘지 않는 곳은(=커피 정체성 유지) 소폭 가점.
export function dessertDominance(cs: Record<string, number> | null | undefined): { bonus: boolean; dominant: boolean } {
  const c = cs ?? {};
  const dessert = c.dessert ?? 0;
  const coffeeAxes = (c.roast ?? 0) + (c.work ?? 0) + (c.quiet ?? 0) + (c.mood ?? 0) + (c.space ?? 0);
  return { bonus: dessert <= coffeeAxes, dominant: dessert > coffeeAxes * 2 };
}
