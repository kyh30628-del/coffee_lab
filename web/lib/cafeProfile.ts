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

// ── 결(taste) 유사도 ──────────────────────────────────────────────────
// '비슷한 카페' 추천용 — 후기 1건당 언급률 벡터(카페profile과 같은 정규화 기준)로 코사인 유사도.
export function tasteVector(cs: Record<string, number> | null | undefined, cnt: number | null | undefined): number[] {
  const c = cnt ?? 0;
  const scores = cs ?? {};
  return CHAR_AXES.map((ax) => (c > 0 ? (scores[ax.key] ?? 0) / c : 0));
}
export function tasteSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}
// '비슷한 카페' 정렬 1순위(등급) — /c/[id] 상세와 지도 패널(app/page.tsx) 양쪽에서 공유.
export const GRADE_RANK: Record<string, number> = { "검증": 0, "참고": 1, "후보": 2 };

// ── 리뷰 핵심 하이라이트 ──────────────────────────────────────────────
// 옥석(검증) 리뷰들에서 '소비자가 꼭 볼 구체 포인트'를 빈도로 추출. 6개 결보다 구체적·실질적.
// 측정값이 아니라 검증 후기에 실제로 자주 나온 것 → '데이터 기반 분석'의 실체.
// 키워드는 전부 '긍정·구체 맥락 phrase'만 — 맨 명사(주차·호수·넓)는 지명/부정문에 오탐나므로 금지.
//   해자 핵심: 틀린 그룹핑 1건이 신뢰를 깨므로 '확실할 때만' 보수적으로.
// 2026-09-14 — `min`은 그 피처를 인정하는 **최소 언급 후기 수**(없으면 공통 임계 9%+최소3건).
//   왜 나눴나: 공통 임계는 '분위기·커피맛' 같은 인상 어휘에 맞춰져 있다. 그런데 **주차·단체석·노키즈처럼
//   사실 진술**은 후기에 자주 안 나온다(실측: 단체·모임룸이 전국 4곳, 키워드를 40개로 넓혀도 표본 1,200곳 중 2곳).
//   사실 진술은 서로 다른 후기 2건이면 충분히 확실하고(부정어 가드가 '주차 불편'류를 이미 거른다),
//   소비자에겐 "단체 가능"이 인상평보다 훨씬 결정적인 정보다. 인상 어휘는 기존 보수 임계를 그대로 둔다.
const HIGHLIGHTS: { label: string; emoji: string; kws: string[]; min?: number }[] = [
  { label: "통창·창밖 뷰", emoji: "🪟", kws: ["통창", "큰 창", "창밖 뷰", "창밖 풍경", "뷰맛집", "뷰가 좋", "뷰가 예", "뷰가 멋", "뷰가 끝내", "전망이 좋", "뷰 보면서", "뷰 보며"] },
  { label: "루프탑·테라스", emoji: "🌿", kws: ["루프탑", "테라스", "옥상 테라스", "야외 좌석", "야외 테이블"], min: 2 },
  { label: "정원·자연 속", emoji: "🌳", kws: ["정원이 예", "정원이 넓", "넓은 정원", "앞마당", "뒷마당", "가든뷰", "숲뷰", "숲세권", "숲속", "산뷰", "산이 보이", "나무가 보이", "초록빛 가득", "자연 속에"] },
  { label: "강·바다 뷰", emoji: "🌊", kws: ["한강뷰", "한강이 보", "한강 보이", "강뷰", "강이 보이", "오션뷰", "바다가 보", "바다뷰", "바다 전망", "리버뷰", "리버사이드", "호수뷰", "호수가 보", "물멍", "워터프론트"] },
  { label: "넓고 탁 트인 공간", emoji: "🏛️", kws: ["넓은 공간", "공간이 넓", "넓고 쾌적", "넓어서 좋", "대형 카페", "대형카페", "탁 트", "층고가 높", "층고 높", "웅장", "규모가 크"] },
  { label: "주차 편함", emoji: "🅿️", kws: [
    // 2026-09-14: 맨 명사 "주차장"·"주차 공간"은 '근처 공영주차장 이용'처럼 **남의 주차장**도 잡아 제거했다.
    "주차 가능", "주차 편", "주차하기 좋", "주차가 넓", "주차 공간이 넓", "주차 무료", "무료 주차", "넉넉한 주차",
    "발렛", "전용 주차장", "주차장 완비", "주차장이 넓", "주차장 있", "주차 걱정 없", "주차 여유"], min: 2 },
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
  { label: "반려동물 동반", emoji: "🐾", kws: ["애견", "반려동물", "강아지 동반", "강아지와", "펫 동반", "반려견"], min: 2 },
  { label: "늦게까지·심야", emoji: "🌙", kws: ["늦게까지", "심야", "24시", "밤늦", "새벽까지"], min: 2 },
  { label: "차·티 전문", emoji: "🍵", kws: ["차가 맛있", "전통차", "말차 맛", "티룸", "차 전문", "수제 차", "다양한 차", "티 페어링"], min: 2 },
  { label: "비건·건강한", emoji: "🌱", kws: ["비건", "글루텐프리", "글루텐 프리", "건강한 빵", "건강한 디저트", "건강한 재료"], min: 2 },
  { label: "책·북카페", emoji: "📚", kws: ["북카페", "책방", "책이 많", "책 읽기 좋", "독서하기 좋"], min: 2 },
  { label: "전시·작품", emoji: "🖼️", kws: ["전시회", "전시 공간", "작품 전시", "그림이 걸", "갤러리처럼"], min: 2 },
  // 2026-09-14(CEO "단체·모임룸 키워드 넓혀") — 기존 6개는 너무 좁아 전국 4곳만 잡혔다. 실제 후기 표현으로 확장.
  //   맨 명사("룸"·"대여")는 금지 원칙 유지 — 전부 '긍정·구체 맥락 phrase'로만 넓힌다(부정어 가드는 공통 적용).
  { label: "단체·모임룸", emoji: "👥", kws: [
    "단체석", "단체 석", "단체 손님", "단체 예약", "단체 가능", "단체도 가능", "단체로 가기 좋", "단체 모임", "단체 이용",
    "모임하기 좋", "모임 하기 좋", "모임에 좋", "모임 장소", "모임장소", "회식하기 좋", "회의하기 좋", "회의 가능",
    "룸이 있", "룸도 있", "독립된 룸", "프라이빗 룸", "프라이빗한 공간", "개별 룸", "룸 예약", "룸 있어",
    "대관 가능", "대관 문의", "대관 됩", "대관도 가능", "공간 대여", "세미나실", "세미나 가능",
    "파티룸", "모임용"   /* 2026-09-14: 돌잔치·브라이덜 제거 — 케이크 용도·촬영 후기가 잡혔다(id84 "리본케이크, 브라이덜샤워에 딱") */, "여럿이 가기 좋", "여러 명이", "다같이 가기 좋", "큰 테이블", "긴 테이블"], min: 2 },
  { label: "노키즈존", emoji: "🚸", kws: ["노키즈"], min: 2 },
  { label: "빈티지·레트로", emoji: "🪑", kws: ["빈티지", "레트로", "앤티크", "옛날 감성", "고재 가구"] },
  { label: "한옥·전통", emoji: "🏯", kws: ["한옥", "고택", "전통 가옥"], min: 2 },
  { label: "식물·플랜테리어", emoji: "🪴", kws: ["플랜테리어", "식물이 가득", "온실 같", "보타닉", "그린 가득"], min: 2 },
  { label: "와인·주류", emoji: "🍷", kws: ["와인 한잔", "와인바", "칵테일", "보틀숍", "주류도 판"], min: 2 },
  // ── 자동 발굴(LLM) → 검토 후 추가 (2026-06-23) ──
  { label: "시그니처 음료", emoji: "🥤", kws: ["시그니처 음료", "시그니처 라떼", "시그니처 메뉴", "대표 시그니처", "여기만의 메뉴"] },
  { label: "원두 판매·로스터리", emoji: "🫘", kws: ["원두 판매", "원두 구입", "원두 구매", "원두를 살", "드립백 판매", "원두 종류가 많"], min: 2 },
  { label: "키즈·놀이공간", emoji: "🧸", kws: ["놀이방", "모래놀이", "키즈 카페", "아이들 놀기 좋", "놀이 공간이 있", "키즈 놀이"], min: 2 },
];

// 부정 맥락 가드 — 키워드 바로 주변(앞3·뒤7자)에 부정어 있으면 그 언급은 '긍정 아님'으로 제외.
//   ('주차 불편' '넓지 않' '조용하지 않' '예쁘진 않' 등). 좁은 창으로 다른 절의 부정어 오인 최소화.
const NEG = /(안\s|않|없|못\s|불편|어렵|힘들|별로|아쉽|부족|아니|덜\s|글쎄|협소|좁|빠듯|만만치|치열|전쟁|헬)/;   // 2026-09-14: 협소·좁 등 추가(실측 '주차장 있음(협소)'가 '주차 편함'으로 잡혔다)
function hasPositiveMention(text: string, kws: string[]): boolean {
  for (const k of kws) {
    const kl = k.toLowerCase();
    let i = text.indexOf(kl);
    while (i !== -1) {
      const win = text.slice(Math.max(0, i - 14), i + kl.length + 10);   // 2026-09-14: 앞 3자 → 14자(실측 '주차 공간은 따로 없고 근처 공영주차장'의 부정어를 놓쳤다)
      if (!NEG.test(win)) return true; // 부정어 없는 긍정 언급 1건이라도 있으면 인정
      i = text.indexOf(kl, i + 1);
    }
  }
  return false;
}

export type Highlight = { label: string; emoji: string; count: number };
// 검증 리뷰들에서 피처별 '긍정 언급 후기 수'를 세어 상위 N개. 보수적 임계(표본의 9%+·최소 3건).
// 🕰️ 후기 나이(2026-09-24 CEO 지시: "1년 반 전 후기는 눈에 띄게 날짜 처리") — 메뉴·분위기는 바뀐다.
//   실측(공개 1,000곳): 검증 후기의 56%가 18개월보다 오래됐다. 빼면 공개 카페 16.7%가 사라지므로
//   **빼지 않고 드러낸다**. 네 화면(패널 인용·패널 전체 목록·/c/[id]·/cafe)이 이 함수 하나를 쓴다.
export const OLD_REVIEW_MONTHS = 18;
export function reviewAge(date: unknown, now = Date.now()): { ym: string; old: boolean; ago: string } | null {
  const m = String(date ?? "").match(/^(\d{4})[.\-](\d{1,2})/);
  if (!m) return null;
  const d = new Date(now);
  const months = (d.getFullYear() - Number(m[1])) * 12 + (d.getMonth() + 1 - Number(m[2]));
  const ym = `${m[1]}.${m[2].padStart(2, "0")}`;
  if (months < OLD_REVIEW_MONTHS) return { ym, old: false, ago: "" };
  return { ym, old: true, ago: months < 24 ? "1년 반 전" : `${Math.floor(months / 12)}년 전` };
}

// 🕰️ dates(선택, texts와 같은 순서) — 2026-09-24 CEO 승인 "요약은 최근 후기에 가중".
//   표시 숫자(count)와 등장 기준(9%·최소 3건)은 **실제 건수 그대로**. 바뀌는 건 순서·상위 N 선정뿐이다:
//   18개월 넘은 후기는 0.5점으로 쳐서 요즘 많이 나오는 특징이 앞에 선다(정보는 빠지지 않는다).
//   검색 패싯(extractFacets)은 dates를 넘기지 않으므로 무변.
export function extractHighlights(texts: string[], topN = 6, dates?: unknown[]): Highlight[] {
  const rows = (texts || []).map((t, i) => ({ t: (t || "").toLowerCase(), w: dates ? (reviewAge(dates[i])?.old ? 0.5 : 1) : 1 })).filter((r) => r.t);
  if (rows.length < 6) return []; // 표본 너무 적으면(분석 신뢰 낮음) 생략
  const minCount = Math.max(3, Math.round(rows.length * 0.09)); // 보수적: 9%+ & 최소 3건
  const out: (Highlight & { score: number })[] = [];
  for (const f of HIGHLIGHTS) {
    const hit = rows.filter((r) => hasPositiveMention(r.t, f.kws));
    const c = hit.length;
    const need = f.min ?? minCount;   // 사실형 피처(주차·단체·노키즈…)는 전용 최소치, 인상 어휘는 공통 보수 임계
    if (c >= need) out.push({ label: f.label, emoji: f.emoji, count: c, score: hit.reduce((s, r) => s + r.w, 0) });
  }
  return out.sort((a, b) => b.score - a.score || b.count - a.count).slice(0, topN).map(({ score: _s, ...h }) => h);
}

// 🔎 검색용 시설·특징 패싯(2026-09-14, CEO "주차·반려동물 같은 정보로도 검색되게").
//   화면 하이라이트는 상위 6개만 보여주지만, **검색은 전부 알아야** '주차되는 카페'가 제대로 걸린다.
//   같은 사전·같은 보수 임계(9%+·최소 3건·부정어 가드)를 쓰므로 화면과 검색이 어긋나지 않는다.
//   결과는 라벨 문자열 배열 → cafes.facets(text[])에 저장하고 GIN으로 찾는다.
export function extractFacets(texts: string[]): string[] {
  return extractHighlights(texts, 99).map((h) => h.label);
}
export const ALL_FACET_LABELS: string[] = HIGHLIGHTS.map((h) => h.label);
/** 라벨 → 아이콘. 카드에 **시각 띠**로 쓴다(2026-09-14) — 우리는 사진이 없으므로 이 자리가 시각 앵커다. */
export const FACET_EMOJI: Record<string, string> = Object.fromEntries(HIGHLIGHTS.map((h) => [h.label, h.emoji]));
/** 카드에 세울 우선순위 — '가기 전에 확인하는 사실'이 인상평보다 먼저. 사진이 없으니 이게 첫인상이다. */
const FACET_CARD_ORDER = ["주차 편함", "작업·노트북", "단체·모임룸", "반려동물 동반", "루프탑·테라스", "늦게까지·심야",
  "노키즈존", "넓고 탁 트인 공간", "통창·창밖 뷰", "강·바다 뷰", "정원·자연 속", "한옥·전통", "책·북카페",
  "커피가 맛있는", "디저트 맛집", "베이커리", "수제·당일 베이킹", "차·티 전문", "비건·건강한", "와인·주류"];
export function cardFacets(facets: string[] | null | undefined, n = 3): { label: string; emoji: string }[] {
  const has = new Set(facets ?? []);
  const out: { label: string; emoji: string }[] = [];
  for (const l of FACET_CARD_ORDER) { if (has.has(l) && FACET_EMOJI[l]) { out.push({ label: l, emoji: FACET_EMOJI[l] }); if (out.length >= n) break; } }
  return out;
}

// ⚠️ 2026-09-14(CEO 승인) — "이건 알고 가세요": 후기에서 확인된 **주의점**.
//   왜 만드나: 카페 고르기의 본질은 성공을 찾는 게 아니라 실패를 피하는 것이다. 광고는 절대 못 하는 말이라
//   우리 해자와 가장 멀리 떨어진 차별점이고, 경쟁 서비스(카페맵 포함)도 부정 신호를 '거르는 데만' 쓰고 보여주진 않는다.
//
// 🔴 설계에서 가장 중요한 결정: **긍정 키워드 + 부정어(NEG) 조합으로 만들지 않는다.**
//   "주차 걱정 없이"·"주차 부족함 없"·"아쉬움 없이"가 전부 부정으로 뒤집혀 잡힌다(실측 어휘로 확인).
//   대신 **그 자체로 부정인 표현**만 등재한다. 각 항목이 자기완결적이라 맥락 추론이 필요 없다.
const CAUTIONS: { label: string; emoji: string; kws: string[] }[] = [
  { label: "주차 어려움", emoji: "🅿️", kws: ["주차가 불편", "주차 불편", "주차하기 불편", "주차가 어렵", "주차하기 어렵", "주차 어려", "주차가 힘들", "주차 힘들", "주차공간이 협소", "주차 공간이 협소", "주차장이 협소", "주차장이 좁", "주차가 협소", "주차 자리가 없", "주차할 곳이 없", "주차장이 없", "주차 불가", "주차가 안 되"] },
  { label: "좌석 부족", emoji: "💺", kws: ["자리가 없", "자리가 부족", "좌석이 부족", "좌석이 적", "자리가 적", "테이블이 적", "좌석수가 적", "앉을 자리가 없", "자리 잡기 힘들", "자리 경쟁"] },
  { label: "웨이팅 있음", emoji: "⏳", kws: ["웨이팅이 길", "웨이팅 길", "웨이팅이 심", "오래 기다", "한참 기다", "대기가 길", "줄이 길", "줄 서서 기다"] },
  { label: "콘센트 부족", emoji: "🔌", kws: ["콘센트가 없", "콘센트 없", "콘센트가 부족", "콘센트가 적", "콘센트가 거의"] },
  { label: "소음 있음", emoji: "🔊", kws: [/* 2026-09-14: 맨 어간 "시끄러"는 '시끄러운 곳을 피해' 같은 회피 서술도 잡았다 → 종결형만 */
    "시끄러워", "시끄러웠", "시끄럽고", "시끄러움", "시끄럽습", "시끄러운 편", "소음이 있", "소란스", "음악이 너무 크", "대화 소리가 크"] },
  { label: "공간 협소", emoji: "📐", kws: ["공간이 협소", "매장이 협소", "내부가 좁", "공간이 좁", "매장이 좁", "생각보다 좁", "협소해서"] },
  { label: "주말 혼잡", emoji: "🧍", kws: ["주말엔 사람이 많", "주말에는 사람이 많", "주말엔 붐", "주말에 붐", "주말엔 복잡", "주말에 복잡", "주말엔 웨이팅"] },
  { label: "계단 있음", emoji: "🪜", kws: ["계단이 많", "계단을 올라", "계단이 가파", "엘리베이터가 없", "엘리베이터 없"] },
  { label: "반려동물 불가", emoji: "🚫", kws: ["반려동물은 불가", "애견 불가", "반려동물 동반 불가", "강아지는 안 되", "노펫"] },
  { label: "가격대 높음", emoji: "💰", kws: ["가격이 비싸", "비싼 편", "가격대가 높", "가격이 좀 있", "가성비는 아쉽", "가격은 아쉽"] },
  { label: "결제 제한", emoji: "💳", kws: ["현금만", "현금 결제만", "카드가 안 되", "카드 안 되", "카드 결제가 안"] },
  { label: "화장실 외부", emoji: "🚻", kws: ["화장실이 밖", "화장실이 외부", "화장실이 건물", "공용 화장실"] },
  { label: "예약 필요", emoji: "📅", kws: ["예약 필수", "예약이 필수", "예약제로 운영", "사전 예약 필", "예약하고 가야", "예약 후 방문"] },
  { label: "브레이크타임", emoji: "⏸️", kws: ["브레이크타임", "브레이크 타임"] },
];

// 부정 표현이 다시 뒤집히는 경우만 막는다: "주차가 불편하지 않아요" · "자리가 없지 않" 등.
//   키워드 **직후 8자 안**에 '않/아니'가 오면 그 언급은 주의점이 아니다.
// 🔴 2026-09-14 실측 보강 2종:
//   ① 뒤집기: "주차가 불편하지 않아요" — 직후 8자 안에 '않/아니'
//   ② **가정문**: "여차하여 자리가 없으면 조별로" — 실제로 자리가 없었다는 진술이 아니다(실측 오탐, 테라로사 포스코센터점).
const CAUTION_FLIP = /^(?:[^.!?\n]{0,8}(?:않|아니)|으?면)/;
// 블로그 '정보란'(영업시간·전화번호·출구 안내 나열) 판별 — 실측 2026-09-14: 근거 문장의 75%가 이 형태였다.
//   사실 정확도는 오히려 높지만 **손님이 겪은 말이 아니다.** 서술형 근거가 있으면 그쪽을 먼저 보여준다.
const INFO_BLOCK = /(\d{2,4}-\d{3,4}-\d{4}|\d{1,2}:\d{2}|영업시간|라스트\s?오더|라스트오더|⏰|☎|정기휴무|휴무일|번\s?출구)/;
function hasCautionMention(text: string, kws: string[]): string | null {
  for (const k of kws) {
    const kl = k.toLowerCase();
    let i = text.indexOf(kl);
    while (i !== -1) {
      if (!CAUTION_FLIP.test(text.slice(i + kl.length, i + kl.length + 10))) {
        // 근거 문장을 함께 돌려준다 — "우리 판단"이 아니라 "손님이 쓴 말"임을 보이기 위해.
        // 🔴 2026-09-14 실측 수정: 마침표로 문장을 자르면 블로그 후기(마침표 거의 없음)에서
        //   **키워드가 빠진 엉뚱한 구간**이 근거로 붙었다(실측: '주차 어려움'인데 근거엔 주차 얘기 없음).
        //   반드시 매치 위치를 중심으로 잘라 **근거 안에 그 표현이 들어있게** 한다.
        let from = Math.max(0, i - 40), to = Math.min(text.length, i + kl.length + 45);
        // 단어 중간에서 잘려 "길 8 k.c빌딩"처럼 시작하던 것 방지 — 앞쪽은 가장 가까운 공백으로 스냅.
        const sp = text.lastIndexOf(" ", from + 12);
        if (sp > from - 1 && sp < i) from = sp + 1;
        return text.slice(from, to).replace(/\s+/g, " ").trim();
      }
      i = text.indexOf(kl, i + 1);
    }
  }
  return null;
}

export type Caution = { label: string; emoji: string; count: number; quote: string };
/** 주의점 추출 — 서로 다른 후기 **2건 이상**에서 확인될 때만. 근거 문장 1개를 함께 담는다. */
export function extractCautions(texts: string[], topN = 4): Caution[] {
  const arr = (texts || []).map((t) => (t || "").toLowerCase()).filter(Boolean);
  if (arr.length < 6) return []; // 하이라이트와 같은 규약 — 표본이 적으면 판단하지 않는다
  const out: Caution[] = [];
  for (const c of CAUTIONS) {
    let count = 0, quote = "", proseQuote = "";
    for (const t of arr) {
      const q = hasCautionMention(t, c.kws);
      if (q) { count++; if (!quote) quote = q; if (!proseQuote && !INFO_BLOCK.test(q)) proseQuote = q; }
    }
    quote = proseQuote || quote;   // 손님 서술형이 하나라도 있으면 그것을 근거로 보여준다
    if (count >= 2) out.push({ label: c.label, emoji: c.emoji, count, quote });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, topN);
}
export const ALL_CAUTION_LABELS: string[] = CAUTIONS.map((c) => c.label);
