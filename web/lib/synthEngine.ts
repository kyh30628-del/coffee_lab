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

export function synthesize(name: string, reviews: Review[], area: string[] = []): SynthResult {
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

  return { name, reviewCount: n, grade, coords, basis, uses, ops, evidence, identity: buildIdentity(coords, basis, uses, ops, area) };
}

// 리뷰 종합 한 줄 — 검증 후기에서 실제로 드러난 신호만(환각 금지) 따뜻하고 와닿게, 절제해서.
//   군더더기('(N건)'·따옴표) 빼고 소비자가 바로 그려지는 표현으로. 풍성함은 위 '강점/아쉬운점' 블록이 보완.
const USE_PHRASE: Record<string, string> = {
  작업: "작업·공부하기 좋은 곳", 혼자: "혼자 조용히 머물기 좋은 곳", 수다: "함께 도란도란 이야기 나누기 좋은 곳",
  사진: "사진 찍기 좋은 분위기", 빵: "빵·디저트가 특히 자주 언급되는 곳",
};
function buildIdentity(coords: Record<string, number | null>, basis: Record<string, string>, uses: Record<string, number>, ops: Record<string, number>, area: string[] = []) {
  const p: string[] = [];
  if ((ops["직접로스팅"] ?? 0) >= 2) p.push("직접 로스팅하는 곳"); // 1건은 환각 위험 → 2건+만 주장
  const a = coords.acidity, b = coords.body, s = coords.sweet;
  if (a != null && a >= 0.65) p.push("산미가 또렷한 커피");
  else if (a != null && a <= 0.35) p.push("부드럽고 산미가 낮은 커피");
  if (b != null && b >= 0.65) p.push("묵직하고 고소한 바디");
  else if (b != null && b <= 0.35) p.push("가볍고 부드러운 바디");
  if (s != null && s >= 0.65) p.push("단맛이 좋은 디저트");
  // 취향·로스팅 근거가 하나도 없어 아래 용도 문구 하나만으로 정체성이 정해지는 카페 — 전국 다수 카페가
  // 같은 최다-용도 키워드로 수렴해 완전히 동일한 한 줄이 되는 원인(협업 #211). 실제 소재지(동)를 붙여
  // 카페별로 갈라지게 한다(환각 아님 — area는 이미 검증된 실제 소재지 데이터).
  const soleSignal = p.length === 0;
  const tu = Object.entries(uses).sort((x, y) => y[1] - x[1])[0];
  if (tu && USE_PHRASE[tu[0]]) {
    const locality = area.filter(Boolean).slice(-1)[0];
    p.push(soleSignal && locality ? `${locality}에서 ${USE_PHRASE[tu[0]]}` : USE_PHRASE[tu[0]]);
  }
  if (ops["원두판매"] && p.length < 4) p.push("원두도 살 수 있는 곳");
  if (ops["권위"]) p.push("매체·평단에 소개된 곳");
  return p.length ? p.join(" · ") : "후기가 더 모이면 분석이 또렷해져요";
}
