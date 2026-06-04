// 리뷰 합성 엔진 (PRINCIPLES.md 1·3·4·7조 준수)
// - 부정맥락 보정(다국어) + 모호어 처리 + 교차검증 + 최신성 가중 + 근거 보존

export type Review = { text: string; time?: number }; // time: epoch초(최신성용, 옵션)

const SIGNALS: Record<string, { strong: string[]; weak: string[] }> = {
  acidity: {
    strong: ["산미","신맛","상큼","과일향","베리","시트러스","플로럴","꽃향","게이샤","acidity","acidic","sour","fruity","floral","berry","citrus","bright","geisha"],
    weak: ["산미가 없","산미없","신맛이 없","산미 거의","산미가 적","산미 불호","산미가 약","not sour","no acidity","without acidity","low acidity","less acidic","not much sour"],
  },
  body: {
    strong: ["묵직","진한","바디감","다크","스모키","고소","견과","다크초콜릿","full body","full-bodied","heavy body","dark chocolate","nutty","robust","bold","rich body"],
    weak: ["가볍","연한","밍밍","물 같","라이트","light body","watery","thin","light-bodied"],
  },
  sweet: {
    strong: ["단맛","달달","달콤","카라멜","바닐라","꿀","sweet","sweetness","caramel","vanilla","honey","sugary"],
    weak: ["안 달","안달","달지 않","씁쓸","쓴맛","not sweet","bitter","less sweet"],
  },
};
const AMBIGUOUS: Record<string, string[]> = {
  body: ["smooth","부드러","clean","깔끔","mellow","mild","soft","delicate"], // 바디↓
};
const USE_SIGNALS: Record<string, string[]> = {
  작업: ["작업","노트북","공부","콘센트","좌석","read","work","laptop","study","books"],
  혼자: ["혼자","조용","사색","차분","고요","quiet","serene","calm","low key","low-key","peaceful"],
  수다: ["수다","친구","대화","일행","함께","group","friends","together","chat"],
  사진: ["사진","인테리어","예쁜","감성","분위기","루프탑","interior","ambience","ambiance","aesthetic","rooftop"],
  빵: ["빵","베이커리","스콘","크루아상","디저트","케이크","티라미수","bread","bakery","scone","croissant","dessert","cake","tiramisu","pastry"],
};
const OP_SIGNALS: Record<string, string[]> = {
  직접로스팅: ["직접 로스팅","로스팅","자가배전","직접 볶","로스터리","roast","roasted","roasting","in-house","in house"],
  원두판매: ["원두 판매","원두 구매","원두 사","원두 한봉","bag of bean","beans to take","buy a bag","roasted coffee beans"],
  권위: ["블루리본","수상","10년 연속","미슐랭","blue ribbon","best specialty","key player","reputation","hidden gem"],
};
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
  name: string; reviewCount: number; grade: "검증" | "참고" | "발굴";
  coords: Record<string, number | null>; basis: Record<string, string>;
  uses: Record<string, number>; ops: Record<string, number>;
  evidence: Record<string, { kind: string; snip: string }[]>;
  identity: string;
};

export function synthesize(name: string, reviews: Review[]): SynthResult {
  const clean = reviews.filter((r) => r.text && !AD.test(r.text));
  const n = clean.length;
  const axes = Object.keys(SIGNALS);
  const stat: Record<string, { pos: number; neg: number; ev: { kind: string; snip: string }[] }> = {};
  axes.forEach((a) => (stat[a] = { pos: 0, neg: 0, ev: [] }));

  for (const ax of axes) {
    const amb = AMBIGUOUS[ax] ?? [];
    for (const r of clean) {
      const w = recencyWeight(r.time);
      const { pos, neg, ev } = scanAxis(r.text, SIGNALS[ax], amb);
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
  for (const [u, kws] of Object.entries(USE_SIGNALS)) {
    const c = clean.filter((r) => kws.some((k) => r.text.toLowerCase().includes(k.toLowerCase()))).length;
    if (c) uses[u] = c;
  }
  const ops: Record<string, number> = {};
  for (const [o, kws] of Object.entries(OP_SIGNALS)) {
    const c = clean.filter((r) => kws.some((k) => r.text.toLowerCase().includes(k.toLowerCase()))).length;
    if (c) ops[o] = c;
  }

  const grade = n >= 30 ? "검증" : n >= 5 ? "참고" : "발굴";
  const evidence: Record<string, { kind: string; snip: string }[]> = {};
  axes.forEach((a) => (evidence[a] = stat[a].ev.slice(0, 3)));

  return { name, reviewCount: n, grade, coords, basis, uses, ops, evidence, identity: buildIdentity(coords, basis, uses, ops) };
}

function buildIdentity(coords: Record<string, number | null>, basis: Record<string, string>, uses: Record<string, number>, ops: Record<string, number>) {
  const p: string[] = [];
  if (ops["직접로스팅"]) p.push(`직접 로스팅(${ops["직접로스팅"]}건)`);
  const a = coords.acidity, b = coords.body, s = coords.sweet;
  if (a != null && a >= 0.65) p.push(`산미 또렷`);
  if (a != null && a <= 0.35) p.push(`산미 낮고 부드러움`);
  if (b != null && b >= 0.65) p.push(`묵직·고소`);
  if (b != null && b <= 0.35) p.push(`가볍고 부드러운 바디`);
  if (s != null && s >= 0.65) p.push(`단맛·디저트 강점`);
  const tu = Object.entries(uses).sort((x, y) => y[1] - x[1])[0];
  if (tu) p.push(`'${tu[0]}'에 적합(${tu[1]}건)`);
  if (ops["권위"]) p.push("외부 평판 언급");
  return p.length ? p.join(" · ") : "데이터 부족 — 추가 수집 필요";
}
