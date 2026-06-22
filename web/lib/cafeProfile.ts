// 카페 '한눈에 판단' 프로필 — 결(char) 언급을 전체 카페 대비 상대 위치(percentile)로 환산해
// 강점(상위)·아쉬운점(하위)으로 나눈다. 원시 카운트는 축마다 편향(space는 늘 큼, work/quiet는 늘 작음)이라
// '전체 중 어느 위치인지'가 진짜 신호 — 소비자가 옥석(리뷰)을 보기 전에 직관적으로 판단할 핵심.
import { CHAR_AXES } from "./charScore";

export type CafeLite = { char_scores?: Record<string, number> | null; synth_count?: number | null };
export type AxisDist = Record<string, number[]>; // 축 → 전체 카페의 '리뷰당 언급률' 정렬 배열

const MIN_CNT = 8; // 표본 너무 적으면 비율이 튀므로 분포·판단에서 제외

// 전체 카페에서 축별 '리뷰당 언급률' 분포(정렬)를 만든다. (클라/서버 공용)
export function buildAxisDist(cafes: CafeLite[]): AxisDist {
  const d: AxisDist = {};
  for (const ax of CHAR_AXES) d[ax.key] = [];
  for (const c of cafes) {
    const cnt = c.synth_count ?? 0; if (cnt < MIN_CNT) continue;
    const cs = c.char_scores ?? {};
    for (const ax of CHAR_AXES) d[ax.key].push((cs[ax.key] ?? 0) / cnt);
  }
  for (const ax of CHAR_AXES) d[ax.key].sort((a, b) => a - b);
  return d;
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

export type ProfileItem = { key: string; label: string; emoji: string; text: string; topPct: number };
export type CafeProfile = { strong: ProfileItem[]; weak: ProfileItem[]; ok: boolean };

// 한 카페의 강점/아쉬운점 산출. dist는 buildAxisDist 결과.
export function cafeProfile(cafe: CafeLite, dist: AxisDist): CafeProfile {
  const cnt = cafe.synth_count ?? 0;
  const cs = cafe.char_scores ?? {};
  if (cnt < MIN_CNT) return { strong: [], weak: [], ok: false };
  const ranked = CHAR_AXES.map((ax) => {
    const rate = (cs[ax.key] ?? 0) / cnt;
    const p = percentile(dist[ax.key], rate);
    return { key: ax.key, label: ax.label, emoji: ax.emoji, raw: cs[ax.key] ?? 0, p, topPct: Math.max(1, Math.round((1 - p) * 100)) };
  });
  // 강점: 상위 ~30% 이상 + 최소 언급 2건(우연 1건 제외). 백분위 높은 순 최대 3개.
  let strong = ranked.filter((r) => r.p >= 0.70 && r.raw >= 2).sort((a, b) => b.p - a.p).slice(0, 3);
  // 강점이 하나도 없으면(평범) 가장 높은 축 1개라도(언급 2건+) 보여줌 — 판단 단서 제공.
  if (strong.length === 0) strong = ranked.filter((r) => r.raw >= 2).sort((a, b) => b.p - a.p).slice(0, 1);
  const strongKeys = new Set(strong.map((s) => s.key));
  // 아쉬운점: 하위 ~30% + 약점 문구 있는 축, 강점과 중복 제외. 백분위 낮은 순 최대 2개.
  const weak = ranked.filter((r) => r.p <= 0.32 && WEAK[r.key] && !strongKeys.has(r.key)).sort((a, b) => a.p - b.p).slice(0, 2);
  return {
    strong: strong.map((r) => ({ key: r.key, label: r.label, emoji: r.emoji, text: STRONG[r.key] ?? r.label, topPct: r.topPct })),
    weak: weak.map((r) => ({ key: r.key, label: r.label, emoji: r.emoji, text: WEAK[r.key], topPct: r.topPct })),
    ok: strong.length > 0 || weak.length > 0,
  };
}
