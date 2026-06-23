// 카페 '한눈에 판단' 프로필 — 결(char) 언급을 전체 카페 대비 상대 위치(percentile)로 환산해
// 강점(상위)·아쉬운점(하위)으로 나눈다. 원시 카운트는 축마다 편향(space는 늘 큼, work/quiet는 늘 작음)이라
// '전체 중 어느 위치인지'가 진짜 신호 — 소비자가 옥석(리뷰)을 보기 전에 직관적으로 판단할 핵심.
import { CHAR_AXES } from "./charScore";

export type CafeLite = { char_scores?: Record<string, number> | null; synth_count?: number | null };
// 축 → 전체 카페의 '후기 1건당 언급률' 정렬 배열(percentile·평균 모두 이 정규화 값 기준 = 공정한 기준).
//   ⚠️ 원시 건수 평균은 후기 많은 카페가 당연히 큰 '왜곡'이라 안 씀 — 반드시 '후기당 비율'로 비교.
export type AxisDist = { rates: Record<string, number[]>; avgRate: Record<string, number> };

const MIN_CNT = 8; // 표본 너무 적으면 비율이 튀므로 분포·판단에서 제외

// 전체 카페에서 축별 '후기당 언급률' 분포(정렬) + 평균 언급률을 만든다. (클라/서버 공용)
export function buildAxisDist(cafes: CafeLite[]): AxisDist {
  const rates: Record<string, number[]> = {}, sum: Record<string, number> = {};
  for (const ax of CHAR_AXES) { rates[ax.key] = []; sum[ax.key] = 0; }
  for (const c of cafes) {
    const cnt = c.synth_count ?? 0; if (cnt < MIN_CNT) continue;
    const cs = c.char_scores ?? {};
    for (const ax of CHAR_AXES) { const r = (cs[ax.key] ?? 0) / cnt; rates[ax.key].push(r); sum[ax.key] += r; }
  }
  const avgRate: Record<string, number> = {};
  for (const ax of CHAR_AXES) { rates[ax.key].sort((a, b) => a - b); avgRate[ax.key] = rates[ax.key].length ? sum[ax.key] / rates[ax.key].length : 0; }
  return { rates, avgRate };
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

// topPct = 전체 상위 %(후기당 언급률 순위), botPct = 하위 %, mult = 평균 대비 배수(후기당 비율 기준).
export type ProfileItem = { key: string; label: string; emoji: string; text: string; topPct: number; botPct: number; mult: number };
export type CafeProfile = { strong: ProfileItem[]; weak: ProfileItem[]; ok: boolean };

// 한 카페의 강점/아쉬운점 산출. dist는 buildAxisDist 결과.
export function cafeProfile(cafe: CafeLite, dist: AxisDist): CafeProfile {
  const cnt = cafe.synth_count ?? 0;
  const cs = cafe.char_scores ?? {};
  if (cnt < MIN_CNT) return { strong: [], weak: [], ok: false };
  const ranked = CHAR_AXES.map((ax) => {
    const rate = (cs[ax.key] ?? 0) / cnt;              // 이 카페의 후기당 언급률
    const ar = dist.avgRate[ax.key] ?? 0;              // 전체 평균 언급률(같은 기준)
    const p = percentile(dist.rates[ax.key], rate);
    const mult = ar > 0 ? rate / ar : (rate > 0 ? 99 : 0);
    return { key: ax.key, label: ax.label, emoji: ax.emoji, raw: cs[ax.key] ?? 0, p,
      topPct: Math.max(1, Math.round((1 - p) * 100)), botPct: Math.max(1, Math.round(p * 100)), mult };
  });
  // 선정 기준 = '평균 대비 배수'(표시값과 일치 → 모순 없음). 강점=평균보다 확실히 많음, 약점=확실히 적음.
  //   강점: 평균의 1.3배+ & 최소 언급 2건. 배수 큰 순 최대 3개.
  const strong = ranked.filter((r) => r.mult >= 1.3 && r.raw >= 2).sort((a, b) => b.mult - a.mult).slice(0, 3);
  const strongKeys = new Set(strong.map((s) => s.key));
  // 약점: 평균의 0.6배 이하(확실히 적음) & 약점 문구 있는 축, 강점 제외. 배수 작은 순 최대 2개.
  const weak = ranked.filter((r) => r.mult <= 0.6 && WEAK[r.key] && !strongKeys.has(r.key)).sort((a, b) => a.mult - b.mult).slice(0, 2);
  const mk = (r: typeof ranked[number], textMap: Record<string, string>): ProfileItem =>
    ({ key: r.key, label: r.label, emoji: r.emoji, text: textMap[r.key] ?? r.label, topPct: r.topPct, botPct: r.botPct, mult: Math.round(r.mult * 10) / 10 });
  return {
    strong: strong.map((r) => mk(r, STRONG)),
    weak: weak.map((r) => mk(r, WEAK)),
    ok: strong.length > 0 || weak.length > 0,
  };
}

// ── 리뷰 핵심 하이라이트 ──────────────────────────────────────────────
// 옥석(검증) 리뷰들에서 '소비자가 꼭 볼 구체 포인트'를 빈도로 추출. 6개 결보다 구체적·실질적.
// 측정값이 아니라 검증 후기에 실제로 자주 나온 것 → '데이터 기반 분석'의 실체.
// 키워드는 전부 '긍정·구체 맥락 phrase'만 — 맨 명사(주차·호수·넓)는 지명/부정문에 오탐나므로 금지.
//   해자 핵심: 틀린 그룹핑 1건이 신뢰를 깨므로 '확실할 때만' 보수적으로.
const HIGHLIGHTS: { label: string; emoji: string; kws: string[] }[] = [
  { label: "통창·창밖 뷰", emoji: "🪟", kws: ["통창", "큰 창", "창밖 뷰", "창밖 풍경", "뷰맛집", "뷰가 좋", "뷰가 예", "뷰가 멋", "뷰가 끝내", "전망이 좋", "뷰 보면서", "뷰 보며"] },
  { label: "루프탑·테라스", emoji: "🌿", kws: ["루프탑", "테라스", "옥상 테라스", "야외 좌석", "야외 테이블"] },
  { label: "정원·자연 속", emoji: "🌳", kws: ["정원이 예", "정원이 넓", "넓은 정원", "앞마당", "뒷마당", "가든뷰", "숲뷰", "숲세권", "숲속", "산뷰", "산이 보이", "나무가 보이", "초록빛 가득", "자연 속에"] },
  { label: "강·바다 뷰", emoji: "🌊", kws: ["한강뷰", "한강이 보", "한강 보이", "강뷰", "강이 보이", "오션뷰", "바다가 보", "바다뷰", "바다 전망", "리버뷰", "리버사이드", "호수뷰", "호수가 보", "물멍", "워터프론트"] },
  { label: "넓고 탁 트인 공간", emoji: "🏛️", kws: ["넓은 공간", "공간이 넓", "넓고 쾌적", "넓어서 좋", "대형 카페", "대형카페", "탁 트", "층고가 높", "층고 높", "웅장", "규모가 크"] },
  { label: "주차 편함", emoji: "🅿️", kws: ["주차 가능", "주차장", "주차 편", "주차하기 좋", "주차 공간", "주차가 넓", "주차 무료", "넉넉한 주차", "발렛"] },
  { label: "수제·당일 베이킹", emoji: "🥐", kws: ["직접 만든", "직접 만드", "수제", "당일 생산", "당일 구운", "직접 구운", "홈메이드", "매장에서 구"] },
  { label: "커피가 맛있는", emoji: "☕", kws: ["커피가 맛", "커피 맛있", "커피가 좋", "원두가 좋", "스페셜티", "핸드드립", "맛있는 커피", "커피 맛집"] },
  { label: "디저트 맛집", emoji: "🍰", kws: ["디저트가 맛", "케이크 맛", "빵이 맛", "디저트 맛집", "디저트가 좋", "휘낭시에", "크로플", "스콘 맛", "꾸덕"] },
  { label: "브런치 좋은", emoji: "🍳", kws: ["브런치", "샌드위치 맛", "에그 베네", "팬케이크", "프렌치토스트"] },
  { label: "조용·차분한", emoji: "🤍", kws: ["조용", "차분", "한적", "고요", "한산", "조용히"] },
  { label: "감성·사진 맛집", emoji: "📸", kws: ["감성", "예쁘", "인스타", "사진 찍기 좋", "포토", "분위기 좋", "사진 맛집", "인생샷"] },
  { label: "아늑·따뜻한", emoji: "🕯️", kws: ["아늑", "포근", "아담", "따뜻한 분위"] },
  { label: "작업·노트북", emoji: "💻", kws: ["작업하기 좋", "노트북", "콘센트", "공부하기 좋", "카공", "좌석이 편"] },
  { label: "친절한 응대", emoji: "🙂", kws: ["친절", "사장님이 좋", "응대가 좋", "서비스가 좋", "사장님 친"] },
  { label: "가성비 좋은", emoji: "💸", kws: ["가성비", "가격이 착", "합리적인 가격", "저렴", "가격 대비"] },
  { label: "웨이팅·인기", emoji: "🔥", kws: ["웨이팅", "오픈런", "줄 서", "줄을 서", "핫플", "사람 많"] },
  { label: "데이트·기념일", emoji: "💕", kws: ["데이트", "기념일", "프러포즈", "특별한 날", "데이트 코스"] },
  { label: "반려동물 동반", emoji: "🐾", kws: ["애견", "반려동물", "강아지 동반", "강아지와", "펫 동반", "반려견"] },
  { label: "늦게까지·심야", emoji: "🌙", kws: ["늦게까지", "심야", "24시", "밤늦", "새벽까지"] },
  { label: "차·티 전문", emoji: "🍵", kws: ["차가 맛있", "전통차", "말차 맛", "티룸", "차 전문", "수제 차", "다양한 차", "티 페어링"] },
  { label: "비건·건강한", emoji: "🌱", kws: ["비건", "글루텐프리", "글루텐 프리", "건강한 빵", "건강한 디저트", "건강한 재료"] },
  { label: "책·북카페", emoji: "📚", kws: ["북카페", "책방", "책이 많", "책 읽기 좋", "독서하기 좋"] },
  { label: "전시·작품", emoji: "🖼️", kws: ["전시회", "전시 공간", "작품 전시", "그림이 걸", "갤러리처럼"] },
  { label: "단체·모임룸", emoji: "👥", kws: ["단체석", "모임하기 좋", "룸이 있", "대관 가능", "단체 가능", "프라이빗 룸"] },
  { label: "노키즈존", emoji: "🚸", kws: ["노키즈"] },
  { label: "빈티지·레트로", emoji: "🪑", kws: ["빈티지", "레트로", "앤티크", "옛날 감성", "고재 가구"] },
  { label: "한옥·전통", emoji: "🏯", kws: ["한옥", "고택", "전통 가옥"] },
  { label: "식물·플랜테리어", emoji: "🪴", kws: ["플랜테리어", "식물이 가득", "온실 같", "보타닉", "그린 가득"] },
  { label: "와인·주류", emoji: "🍷", kws: ["와인 한잔", "와인바", "칵테일", "보틀숍", "주류도 판"] },
];

// 부정 맥락 가드 — 키워드 바로 주변(앞3·뒤7자)에 부정어 있으면 그 언급은 '긍정 아님'으로 제외.
//   ('주차 불편' '넓지 않' '조용하지 않' '예쁘진 않' 등). 좁은 창으로 다른 절의 부정어 오인 최소화.
const NEG = /(안\s|않|없|못\s|불편|어렵|힘들|별로|아쉽|부족|아니|덜\s|글쎄)/;
function hasPositiveMention(text: string, kws: string[]): boolean {
  for (const k of kws) {
    const kl = k.toLowerCase();
    let i = text.indexOf(kl);
    while (i !== -1) {
      const win = text.slice(Math.max(0, i - 3), i + kl.length + 7);
      if (!NEG.test(win)) return true; // 부정어 없는 긍정 언급 1건이라도 있으면 인정
      i = text.indexOf(kl, i + 1);
    }
  }
  return false;
}

export type Highlight = { label: string; emoji: string; count: number };
// 검증 리뷰들에서 피처별 '긍정 언급 후기 수'를 세어 상위 N개. 보수적 임계(표본의 9%+·최소 3건).
export function extractHighlights(texts: string[], topN = 6): Highlight[] {
  const arr = (texts || []).map((t) => (t || "").toLowerCase()).filter(Boolean);
  if (arr.length < 6) return []; // 표본 너무 적으면(분석 신뢰 낮음) 생략
  const minCount = Math.max(3, Math.round(arr.length * 0.09)); // 보수적: 9%+ & 최소 3건
  const out: Highlight[] = [];
  for (const f of HIGHLIGHTS) {
    const c = arr.filter((t) => hasPositiveMention(t, f.kws)).length;
    if (c >= minCount) out.push({ label: f.label, emoji: f.emoji, count: c });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, topN);
}
