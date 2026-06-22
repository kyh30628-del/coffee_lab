// 카페 '한눈에 판단' 프로필 — 결(char) 언급을 전체 카페 대비 상대 위치(percentile)로 환산해
// 강점(상위)·아쉬운점(하위)으로 나눈다. 원시 카운트는 축마다 편향(space는 늘 큼, work/quiet는 늘 작음)이라
// '전체 중 어느 위치인지'가 진짜 신호 — 소비자가 옥석(리뷰)을 보기 전에 직관적으로 판단할 핵심.
import { CHAR_AXES } from "./charScore";

export type CafeLite = { char_scores?: Record<string, number> | null; synth_count?: number | null };
// 축 → 전체 카페의 '리뷰당 언급률' 정렬 배열(percentile용) + 평균 '언급 건수'(비교 표시용)
export type AxisDist = { rates: Record<string, number[]>; avg: Record<string, number> };

const MIN_CNT = 8; // 표본 너무 적으면 비율이 튀므로 분포·판단에서 제외

// 전체 카페에서 축별 언급률 분포(정렬) + 평균 언급 건수를 만든다. (클라/서버 공용)
export function buildAxisDist(cafes: CafeLite[]): AxisDist {
  const rates: Record<string, number[]> = {}, sum: Record<string, number> = {}, num: Record<string, number> = {};
  for (const ax of CHAR_AXES) { rates[ax.key] = []; sum[ax.key] = 0; num[ax.key] = 0; }
  for (const c of cafes) {
    const cnt = c.synth_count ?? 0; if (cnt < MIN_CNT) continue;
    const cs = c.char_scores ?? {};
    for (const ax of CHAR_AXES) { const v = cs[ax.key] ?? 0; rates[ax.key].push(v / cnt); sum[ax.key] += v; num[ax.key]++; }
  }
  const avg: Record<string, number> = {};
  for (const ax of CHAR_AXES) { rates[ax.key].sort((a, b) => a - b); avg[ax.key] = num[ax.key] ? Math.round(sum[ax.key] / num[ax.key]) : 0; }
  return { rates, avg };
}

// 정렬 배열에서 v의 백분위(0~1) = v 이하인 비율.
function percentile(sorted: number[], v: number): number {
  if (!sorted.length) return 0.5;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= v) lo = mid + 1; else hi = mid; }
  return lo / sorted.length;
}

// 강점/약점 표현 — 전문적이되 소비자에게 와닿는 문장.
const STRONG: Record<string, string> = {
  roast: "직접 로스팅·스페셜티에 진심",
  work: "작업·공부하기 좋은 곳",
  quiet: "조용히 머물기 좋은 곳",
  dessert: "디저트가 특히 강한 곳",
  mood: "분위기·사진 맛집",
  space: "넓고 여유로운 공간",
};
const WEAK: Record<string, string> = {
  work: "작업·공부용으로는 덜 언급돼요",
  quiet: "조용한 분위기 위주는 아니에요",
  dessert: "디저트 중심은 아니에요",
  mood: "분위기보다 커피·실속형이에요",
  space: "아담·아늑한 편이에요",
  roast: "", // 로스팅 미언급은 약점으로 안 봄(대부분 카페가 안 함)
};

export type ProfileItem = { key: string; label: string; emoji: string; text: string; topPct: number; count: number; avg: number };
export type CafeProfile = { strong: ProfileItem[]; weak: ProfileItem[]; ok: boolean };

// 한 카페의 강점/아쉬운점 산출. dist는 buildAxisDist 결과.
export function cafeProfile(cafe: CafeLite, dist: AxisDist): CafeProfile {
  const cnt = cafe.synth_count ?? 0;
  const cs = cafe.char_scores ?? {};
  if (cnt < MIN_CNT) return { strong: [], weak: [], ok: false };
  const ranked = CHAR_AXES.map((ax) => {
    const raw = cs[ax.key] ?? 0;
    const p = percentile(dist.rates[ax.key], raw / cnt);
    return { key: ax.key, label: ax.label, emoji: ax.emoji, raw, avg: dist.avg[ax.key] ?? 0, p, topPct: Math.max(1, Math.round((1 - p) * 100)) };
  });
  // 강점: 상위 ~30% 이상 + 최소 언급 2건(우연 1건 제외). 백분위 높은 순 최대 3개.
  let strong = ranked.filter((r) => r.p >= 0.70 && r.raw >= 2).sort((a, b) => b.p - a.p).slice(0, 3);
  // 강점이 하나도 없으면(평범) 가장 높은 축 1개라도(언급 2건+) 보여줌 — 판단 단서 제공.
  if (strong.length === 0) strong = ranked.filter((r) => r.raw >= 2).sort((a, b) => b.p - a.p).slice(0, 1);
  const strongKeys = new Set(strong.map((s) => s.key));
  // 아쉬운점: 중앙값 아래(상대적으로 약한) 축 중 약점 문구 있는 것, 강점 제외. 백분위 낮은 순 최대 2개.
  //   (강점과 균형 있게 '항상 같이' 보여주기 위해 하위 50%까지 넓힘 — 사장님 요청)
  const weak = ranked.filter((r) => r.p < 0.50 && WEAK[r.key] && !strongKeys.has(r.key)).sort((a, b) => a.p - b.p).slice(0, 2);
  const mk = (r: typeof ranked[number], textMap: Record<string, string>): ProfileItem =>
    ({ key: r.key, label: r.label, emoji: r.emoji, text: textMap[r.key] ?? r.label, topPct: r.topPct, count: r.raw, avg: r.avg });
  return {
    strong: strong.map((r) => mk(r, STRONG)),
    weak: weak.map((r) => mk(r, WEAK)),
    ok: strong.length > 0 || weak.length > 0,
  };
}

// ── 리뷰 핵심 하이라이트 ──────────────────────────────────────────────
// 옥석(검증) 리뷰들에서 '소비자가 꼭 볼 구체 포인트'를 빈도로 추출. 6개 결보다 구체적·실질적.
// 측정값이 아니라 검증 후기에 실제로 자주 나온 것 → '데이터 기반 분석'의 실체.
const HIGHLIGHTS: { label: string; emoji: string; kws: string[] }[] = [
  { label: "통창·창밖 뷰", emoji: "🪟", kws: ["통창", "큰 창", "창밖", "창가", "뷰맛집", "뷰가 좋", "뷰가 예"] },
  { label: "루프탑·테라스", emoji: "🌿", kws: ["루프탑", "옥상", "테라스"] },
  { label: "정원·자연 뷰", emoji: "🌳", kws: ["정원", "마당", "가든", "숲", "산뷰", "산 뷰", "자연 속", "초록"] },
  { label: "강·바다 뷰", emoji: "🌊", kws: ["한강", "강뷰", "강 뷰", "오션", "바다뷰", "바다 뷰", "호수", "리버뷰"] },
  { label: "넓고 탁 트인 공간", emoji: "🏛️", kws: ["넓", "대형", "탁 트", "층고", "웅장", "규모"] },
  { label: "주차 편함", emoji: "🅿️", kws: ["주차"] },
  { label: "수제·당일 베이킹", emoji: "🥐", kws: ["직접 만든", "직접 만드", "수제", "당일 생산", "직접 구운", "홈메이드", "매장에서 구"] },
  { label: "커피가 맛있는", emoji: "☕", kws: ["커피가 맛", "커피 맛있", "원두가 좋", "스페셜티", "핸드드립", "산미가", "고소"] },
  { label: "디저트 맛집", emoji: "🍰", kws: ["디저트가 맛", "케이크 맛", "빵이 맛", "휘낭시에", "크로플", "스콘", "꾸덕"] },
  { label: "브런치 좋은", emoji: "🍳", kws: ["브런치", "샌드위치", "에그", "팬케이크", "프렌치토스트"] },
  { label: "조용·차분한", emoji: "🤍", kws: ["조용", "차분", "한적", "고요", "한산"] },
  { label: "감성·사진 맛집", emoji: "📸", kws: ["감성", "예쁘", "인스타", "사진 찍", "포토", "분위기 좋"] },
  { label: "아늑·따뜻한", emoji: "🕯️", kws: ["아늑", "포근", "아담", "따뜻한 분위"] },
  { label: "작업·노트북", emoji: "💻", kws: ["작업", "노트북", "콘센트", "공부하기"] },
  { label: "친절한 응대", emoji: "🙂", kws: ["친절", "사장님이 좋", "응대가 좋", "서비스가 좋", "사장님 친"] },
  { label: "가성비 좋은", emoji: "💸", kws: ["가성비", "가격이 착", "합리적인 가격", "저렴"] },
  { label: "웨이팅·인기", emoji: "🔥", kws: ["웨이팅", "오픈런", "줄 서", "대기", "핫플", "줄을 서"] },
  { label: "데이트·기념일", emoji: "💕", kws: ["데이트", "기념일", "프러포즈", "특별한 날"] },
  { label: "반려동물 동반", emoji: "🐾", kws: ["애견", "반려", "강아지 동반", "펫", "노견"] },
  { label: "늦게까지·심야", emoji: "🌙", kws: ["늦게까지", "심야", "24시", "밤늦", "새벽까지"] },
];

export type Highlight = { label: string; emoji: string; count: number };
// 검증 리뷰 텍스트들(인용/본문)에서 피처별 '언급 후기 수'를 세어 상위 N개 반환.
export function extractHighlights(texts: string[], topN = 6): Highlight[] {
  const arr = (texts || []).map((t) => (t || "").toLowerCase()).filter(Boolean);
  if (arr.length < 4) return []; // 표본 부족
  const minCount = Math.max(2, Math.round(arr.length * 0.06)); // 우연 1건 제외, 6%+ 패턴만
  const out: Highlight[] = [];
  for (const f of HIGHLIGHTS) {
    const c = arr.filter((t) => f.kws.some((k) => t.includes(k.toLowerCase()))).length;
    if (c >= minCount) out.push({ label: f.label, emoji: f.emoji, count: c });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, topN);
}
