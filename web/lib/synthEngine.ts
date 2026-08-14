// 리뷰 합성 엔진 (PRINCIPLES.md 1·3·4·7조 준수)
// - 부정맥락 보정(다국어) + 모호어 처리 + 교차검증 + 최신성 가중 + 근거 보존
import { getCriterionSync } from "./criteria"; // 등급 바닥 임계값 단일출처(캐시 프라임은 synthAndStore가 함)
import { getListSync } from "./criteriaLists"; // 맛/용도/운영 신호어 사전 단일출처(BASE=폴백, 캐시 프라임은 synthAndStore가 함)

export type Review = { text: string; time?: number }; // time: epoch초(최신성용, 옵션)

// 맛 3축 — 신호어(강/약/모호)는 lib/criteriaLists.ts가 단일출처(무배포 편집). 여기엔 축·리터럴키만 둔다(dead-knob 스캔용).
const TASTE_AXES = [
  { ax: "acidity", strong: "taste.acidity.strong", weak: "taste.acidity.weak", amb: "taste.acidity.ambiguous" },
  { ax: "body", strong: "taste.body.strong", weak: "taste.body.weak", amb: "taste.body.ambiguous" },
  { ax: "sweet", strong: "taste.sweet.strong", weak: "taste.sweet.weak", amb: "taste.sweet.ambiguous" },
];
// 용도 — uses 출력 키가 곧 사전 키(use.*).
const USE_KEYS: { u: string; key: string }[] = [
  { u: "작업", key: "use.작업" }, { u: "혼자", key: "use.혼자" }, { u: "수다", key: "use.수다" },
  { u: "사진", key: "use.사진" }, { u: "빵", key: "use.빵" },
];
// 운영 정체성 신호 — ⚠️ 강한 신호만(환각 방지). ops 출력 키가 곧 사전 키(op.*).
const OP_KEYS: { o: string; key: string }[] = [
  { o: "직접로스팅", key: "op.직접로스팅" }, { o: "원두판매", key: "op.원두판매" }, { o: "권위", key: "op.권위" },
];
const AD = /(협찬|광고|체험단|제공받|sponsored|paid partnership)/i;
const NEG_NEAR = /(없|않|안\s|적|불호|약|disappear|not |no |without|less|hardly|barely)/i;

// 최신성 가중: 최근 1년 1.0, 2년 0.7, 3년+ 0.4 (날짜 없으면 0.6 중립)
function recencyWeight(time?: number): number {
  if (!time) return 0.6;
  const ageYears = (Date.now() / 1000 - time) / (365 * 24 * 3600);
  if (ageYears <= 1) return 1.0;
  if (ageYears <= 2) return 0.7;
  if (ageYears <= 3) return 0.5;
  return 0.4;
}

function scanAxis(text: string, cfg: { strong: string[]; weak: string[] }, amb: string[]) {
  let pos = false, neg = false; const ev: { kind: string; snip: string }[] = [];
  const snip = (kw: string) => {
    const i = text.toLowerCase().indexOf(kw.toLowerCase());
    return i < 0 ? kw : text.slice(Math.max(0, i - 14), i + kw.length + 14).replace(/\n/g, " ").trim();
  };
  for (const wk of cfg.weak) if (text.toLowerCase().includes(wk.toLowerCase())) { neg = true; ev.push({ kind: "neg", snip: snip(wk) }); }
  for (const kw of cfg.strong) {
    let idx = text.toLowerCase().indexOf(kw.toLowerCase());
    while (idx >= 0) {
      const win = text.slice(Math.max(0, idx - 14), idx + kw.length + 14);
      if (NEG_NEAR.test(win)) { neg = true; ev.push({ kind: "neg", snip: snip(kw) }); }
      else { pos = true; ev.push({ kind: "pos", snip: snip(kw) }); }
      idx = text.toLowerCase().indexOf(kw.toLowerCase(), idx + 1);
    }
  }
  for (const aw of amb) if (text.toLowerCase().includes(aw.toLowerCase())) { neg = true; ev.push({ kind: "neg(모호어)", snip: snip(aw) }); }
  return { pos, neg, ev };
}

export type SynthResult = {
  name: string; reviewCount: number; grade: "검증" | "참고" | "후보";
  coords: Record<string, number | null>; basis: Record<string, string>;
  uses: Record<string, number>; ops: Record<string, number>;
  evidence: Record<string, { kind: string; snip: string }[]>;
  identity: string;
};

// 완전동일 quote(정규화 후) 중복제거 — SEO 태그블록·경쟁사명 나열 등이 서로 다른 글에서
// 반복 등장해 검증리뷰로 여러 번 카운트되는 것 방지(협업 정합성조사팀 12:04 사이클).
const normalizeQuote = (s: string) => s.replace(/\s+/g, "").trim().toLowerCase();

export function synthesize(name: string, reviews: Review[], area: string[] = [], naverCategory?: string): SynthResult {
  const seenQuotes = new Set<string>();
  const clean = reviews.filter((r) => r.text && !AD.test(r.text)).filter((r) => {
    const key = normalizeQuote(r.text);
    if (seenQuotes.has(key)) return false;
    seenQuotes.add(key);
    return true;
  });
  const n = clean.length; // distinct quote 기준(등급판정용)
  const axes = TASTE_AXES.map((t) => t.ax);
  const stat: Record<string, { pos: number; neg: number; ev: { kind: string; snip: string }[] }> = {};
  axes.forEach((a) => (stat[a] = { pos: 0, neg: 0, ev: [] }));

  for (const t of TASTE_AXES) {
    const ax = t.ax;
    const cfg = { strong: getListSync(t.strong), weak: getListSync(t.weak) };
    const amb = getListSync(t.amb);
    for (const r of clean) {
      const w = recencyWeight(r.time);
      const { pos, neg, ev } = scanAxis(r.text, cfg, amb);
      if (pos) stat[ax].pos += w;
      if (neg) stat[ax].neg += w;
      if (ev[0]) stat[ax].ev.push(ev[0]);
    }
  }

  const coords: Record<string, number | null> = {}, basis: Record<string, string> = {};
  for (const ax of axes) {
    const p = stat[ax].pos, ng = stat[ax].neg;
    if (p >= 2 && p > ng) { coords[ax] = Math.min(0.5 + 0.09 * (p - ng), 0.95); basis[ax] = `강함 ${p.toFixed(1)} / 약함 ${ng.toFixed(1)} (최신가중)`; }
    else if (ng >= 2 && ng > p) { coords[ax] = Math.max(0.5 - 0.09 * (ng - p), 0.05); basis[ax] = `약함 ${ng.toFixed(1)} / 강함 ${p.toFixed(1)} (최신가중)`; }
    else { coords[ax] = null; basis[ax] = `데이터 부족(강함 ${p.toFixed(1)}/약함 ${ng.toFixed(1)})`; }
  }
  const round = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
  axes.forEach((a) => (coords[a] = round(coords[a])));

  const uses: Record<string, number> = {};
  for (const { u, key } of USE_KEYS) {
    const kws = getListSync(key);
    const c = clean.filter((r) => kws.some((k) => r.text.toLowerCase().includes(k.toLowerCase()))).length;
    if (c) uses[u] = c;
  }
  const ops: Record<string, number> = {};
  for (const { o, key } of OP_KEYS) {
    const kws = getListSync(key);
    const c = clean.filter((r) => kws.some((k) => r.text.toLowerCase().includes(k.toLowerCase()))).length;
    if (c) ops[o] = c;
  }

  // 등급 바닥 임계값 — DB 기준(criteria) 단일출처, 폴백=현재값(검증30/참고3). 동기 조회(캐시).
  //   ⚠️ collectAndSynthesize가 이 grade를 덮어쓰므로(synth.grade=grade) 소비자 실등급은 그 경로가 진실 — 둘 다 같은 criterion을 읽어 일치.
  const grade = n >= getCriterionSync("grade.floor.verified") ? "검증" : n >= getCriterionSync("grade.floor.reference") ? "참고" : "후보";
  const evidence: Record<string, { kind: string; snip: string }[]> = {};
  axes.forEach((a) => (evidence[a] = stat[a].ev.slice(0, 3)));

  return { name, reviewCount: n, grade, coords, basis, uses, ops, evidence, identity: buildIdentity(coords, basis, uses, ops, area, clean, naverCategory) };
}

// 리뷰 종합 한 줄 — 검증 후기에서 실제로 드러난 신호만(환각 금지) 따뜻하고 와닿게, 절제해서.
//   군더더기('(N건)'·따옴표) 빼고 소비자가 바로 그려지는 표현으로. 풍성함은 위 '강점/아쉬운점' 블록이 보완.
const USE_PHRASE: Record<string, string> = {
  작업: "작업·공부하기 좋은 곳", 혼자: "혼자 조용히 머물기 좋은 곳", 수다: "함께 도란도란 이야기 나누기 좋은 곳",
  사진: "사진 찍기 좋은 분위기", 빵: "빵·디저트가 특히 자주 언급되는 곳",
};
// 동일 동네에 같은 최다용도 카테고리가 겹치면 '동+용도' 조합만으로 수십~수백 곳이 완전동일 문구로
//   수렴한다(정합성조사 #536 '동+빵' 724곳 → #583 breadTerm 완화 → #605 잔여 135그룹/1,772곳: 사진/작업/
//   혼자/수다는 disambiguator가 없어 그대로 판박이). 5개 용도 전부에 4차 disambiguator를 둔다: '빵'만
//   naver_category 세부값(이미 검증된 실데이터, 환각 아님)을 1순위로 쓰고(카테고리가 곧 용도와 직결),
//   나머지 4개+빵의 폴백은 실제 리뷰 텍스트에 등장한 구체 키워드 1개(SPECIFIC_TERM_KEYWORDS)로 대체한다.
const CATEGORY_BREAD_TERM: Record<string, string> = {
  베이커리: "베이커리 빵", 케이크전문: "케이크", 도넛: "도넛", 아이스크림: "아이스크림",
  빙수: "빙수", 와플: "와플", 베이글: "베이글", 초콜릿전문점: "초콜릿",
};
function categoryBreadTerm(naverCategory?: string): string | null {
  if (!naverCategory) return null;
  const last = naverCategory.split(">").pop()?.trim() ?? "";
  return CATEGORY_BREAD_TERM[last] ?? null;
}
// 용도별 구체 키워드 사전 — USE_KEYS(포괄 신호어)보다 좁고 구체적인 단어만 골라 같은 용도 안에서도 갈라지게 한다.
const SPECIFIC_TERM_KEYWORDS: Record<string, Record<string, string>> = {
  빵: { 스콘: "스콘", scone: "스콘", 크루아상: "크루아상", croissant: "크루아상",
    케이크: "케이크", cake: "케이크", 티라미수: "티라미수", tiramisu: "티라미수" },
  작업: { 콘센트: "콘센트", outlet: "콘센트", 와이파이: "와이파이", wifi: "와이파이", "1인석": "1인석 좌석" },
  혼자: { 창가: "창가 자리", "window seat": "창가 자리", 구석자리: "구석 자리", 테라스: "테라스 자리", 정원: "정원" },
  수다: { 룸: "프라이빗 룸", "private room": "프라이빗 룸", 단체석: "단체석", 야외석: "야외석", 테라스: "테라스" },
  사진: { 루프탑: "루프탑", rooftop: "루프탑", 오션뷰: "오션뷰", 한강뷰: "한강뷰", 통유리: "통유리 창", 식물: "식물 가득한 공간" },
};
function reviewSpecificTerm(category: string, clean: Review[]): string | null {
  const dict = SPECIFIC_TERM_KEYWORDS[category];
  if (!dict) return null;
  const counts = new Map<string, number>();
  for (const [kw, label] of Object.entries(dict)) {
    const c = clean.filter((r) => r.text.toLowerCase().includes(kw.toLowerCase())).length;
    if (c) counts.set(label, (counts.get(label) ?? 0) + c);
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0];
}
// SPECIFIC_TERM_KEYWORDS(위, 코드 고정)의 2차 폴백 — criteriaLists(admin) 단일출처라 무배포 편집 가능.
//   재발(#27→#399→#605→#642, 4회)마다 dev_task로 사전을 넓혀온 구조를 끊는다: 다음부턴 기획조정실장(L2)이
//   /admin/criteria에서 항목만 추가하면 되고, 코드 재배포가 필요없다(decisions#642 구조 전환).
const SPECIFIC_TERM_EXT_KEYS: Record<string, string> = {
  빵: "specific_term.빵", 작업: "specific_term.작업", 혼자: "specific_term.혼자",
  수다: "specific_term.수다", 사진: "specific_term.사진",
};
function reviewSpecificTermExt(category: string, clean: Review[]): string | null {
  const key = SPECIFIC_TERM_EXT_KEYS[category];
  if (!key) return null;
  const items = getListSync(key);
  if (!items.length) return null;
  const counts = new Map<string, number>();
  for (const term of items) {
    const c = clean.filter((r) => r.text.toLowerCase().includes(term.toLowerCase())).length;
    if (c) counts.set(term, c);
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0];
}
// 받침 유무로 이/가 선택 — 기존 코드는 "이"만 고정이라 오션뷰/한강뷰(받침 없음)에 붙으면 비문("오션뷰이 있어")이었다.
//   확장사전이 받침 없는 term도 다수 추가하므로 이 기회에 정확히 교정.
function iGa(term: string): "이" | "가" {
  const last = term[term.length - 1] ?? "";
  const code = last.charCodeAt(0) - 0xac00;
  const hasBatchim = code < 0 || code > 11171 ? true : code % 28 !== 0; // 한글 완성형 밖(영문 등)은 안전폴백
  return hasBatchim ? "이" : "가";
}
// 최다용도 카테고리별 구체 문구 템플릿 — USE_PHRASE(포괄형)를 대체할 때만 쓴다.
const SPECIFIC_PHRASE: Record<string, (term: string) => string> = {
  빵: (term) => `${term}·디저트가 특히 자주 언급되는 곳`,
  작업: (term) => `${term} 갖춘 작업·공부하기 좋은 곳`,
  혼자: (term) => `${term}에서 혼자 조용히 머물기 좋은 곳`,
  수다: (term) => `${term}에서 함께 도란도란 이야기 나누기 좋은 곳`,
  사진: (term) => `${term}${iGa(term)} 있어 사진 찍기 좋은 분위기`,
};
function buildIdentity(coords: Record<string, number | null>, basis: Record<string, string>, uses: Record<string, number>, ops: Record<string, number>, area: string[] = [], clean: Review[] = [], naverCategory?: string) {
  const p: string[] = [];
  if ((ops["직접로스팅"] ?? 0) >= 2) p.push("직접 로스팅하는 곳"); // 1건은 환각 위험 → 2건+만 주장
  const a = coords.acidity, b = coords.body, s = coords.sweet;
  if (a != null && a >= 0.65) p.push("산미가 또렷한 커피");
  else if (a != null && a <= 0.35) p.push("부드럽고 산미가 낮은 커피");
  if (b != null && b >= 0.65) p.push("묵직하고 고소한 바디");
  else if (b != null && b <= 0.35) p.push("가볍고 부드러운 바디");
  if (s != null && s >= 0.65) p.push("단맛이 좋은 디저트");
  // 취향 3축은 각각 강/약/모호 소수 상태뿐이라 조합해도 전국 카페가 몇 안 되는 문구로 쉽게 수렴한다
  // (예: '단맛 좋음 + 빵 최다용도' 조합만 724곳 완전동일, 협업 #211/정합성조사 #536). 용도 문구가 붙는
  // 경우든 아니든 실제 소재지(동)를 상시 포함해 카페별로 갈라지게 한다(환각 아님 — area는 이미 검증된
  // 실제 소재지 데이터).
  const locality = area.filter(Boolean).slice(-1)[0];
  // 동+phrase가 이미 '동에서' 구조인 경우 phrase 안에 '에서'가 또 나오면 어색해지므로(예: '창가 자리에서'),
  // phrase 자체에 '에서'가 있으면 조사 없이 붙인다.
  const wrapLocality = (phrase: string) => (!locality ? phrase : phrase.includes("에서") ? `${locality} ${phrase}` : `${locality}에서 ${phrase}`);
  const useEntries = Object.entries(uses).sort((x, y) => y[1] - x[1]);
  if (useEntries.length) {
    // 레드팀#665: 897곳이 "{동}에서 사진 찍기 좋은 분위기" 고정 템플릿으로 수렴 — 원인은 1위 용도만 구체어를
    // 시도하는 이 폴백조건이었다. use.사진 신호어(분위기/인테리어/예쁜/감성)가 다른 용도보다 훨씬 포괄적이라
    // 거의 항상 1위를 차지하는데, 정작 사진의 구체어 사전(루프탑·오션뷰 등)은 좁아 매칭 실패율이 높다. 그 결과
    // 리뷰에 자동차카페·케이크·프라이빗룸 등 구체 신호가 실제로 있어도(2·3위 용도) 버려지고 포괄 문구로
    // 폴백했다. 1위부터 순서대로 구체어를 시도해 어느 용도든 구체어가 잡히면 그걸 쓰고, 전부 없을 때만
    // 1위 용도의 포괄 문구로 폴백한다(완전 실패 시의 최종 폴백은 그대로 유지 — 서비스 무변).
    let picked: { cat: string; term: string } | null = null;
    for (const [cat] of useEntries) {
      const term = cat === "빵"
        ? categoryBreadTerm(naverCategory) ?? reviewSpecificTerm(cat, clean) ?? reviewSpecificTermExt(cat, clean)
        : reviewSpecificTerm(cat, clean) ?? reviewSpecificTermExt(cat, clean);
      if (term) { picked = { cat, term }; break; }
    }
    const topCat = useEntries[0][0];
    if (picked && SPECIFIC_PHRASE[picked.cat]) p.push(wrapLocality(SPECIFIC_PHRASE[picked.cat](picked.term)));
    else if (USE_PHRASE[topCat]) p.push(wrapLocality(USE_PHRASE[topCat]));
  } else if (locality) p.push(`${locality}의 카페`);
  if (ops["원두판매"] && p.length < 4) p.push("원두도 살 수 있는 곳");
  if (ops["권위"]) p.push("매체·평단에 소개된 곳");
  return p.length ? p.join(" · ") : "후기가 더 모이면 분석이 또렷해져요";
}
