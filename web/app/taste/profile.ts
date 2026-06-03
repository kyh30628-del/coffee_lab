// 질문 답변 → 6축 프로파일(가중 누적) 변환 로직.
// 각 옵션이 여러 축에 부분 점수를 더하고, 마지막에 정규화.
// 축: acidity, body, sweetness (0~1) + flavors(가중치 맵) + roast(0~1) 선호

export type Axis = "acidity" | "body" | "sweetness";
export type Answers = Record<string, string | string[]>;

export type QOption = { value: string; label: string };
export type Question = {
  id: string; title: string; multi?: boolean; advanced?: boolean; options: QOption[];
};

export const QUESTIONS: Question[] = [
  { id: "drink", title: "평소 어떻게 마셔요?", options: [
    { value: "americano", label: "아메리카노" },
    { value: "latte", label: "라떼·우유" },
    { value: "drip", label: "핸드드립" },
    { value: "coldbrew", label: "콜드브루" },
    { value: "espresso", label: "에스프레소" },
  ]},
  { id: "mood", title: "좋아하는 맛 분위기 (여러 개 가능)", multi: true, options: [
    { value: "fruity", label: "상큼·과일" },
    { value: "floral", label: "꽃향기" },
    { value: "choco", label: "초콜릿·고소" },
    { value: "sweet", label: "달콤·카라멜" },
    { value: "heavy", label: "묵직·스모키" },
  ]},
  { id: "acid", title: "산미는 어때요?", options: [
    { value: "love", label: "좋아요" },
    { value: "mid", label: "적당히" },
    { value: "no", label: "부드러운 게 좋아" },
  ]},
  { id: "roast", title: "로스팅 취향?", options: [
    { value: "light", label: "밝고 가볍게" },
    { value: "medium", label: "중간" },
    { value: "dark", label: "진하고 묵직하게" },
  ]},
  { id: "sugar", title: "단맛 선호?", options: [
    { value: "sweet", label: "달큰한 게 좋아" },
    { value: "any", label: "상관없음" },
    { value: "clean", label: "깔끔한 게 좋아" },
  ]},
  // 더 자세히
  { id: "time", title: "주로 즐기는 시간대?", advanced: true, options: [
    { value: "morning", label: "아침 한 잔" },
    { value: "aftermeal", label: "식후" },
    { value: "dessert", label: "디저트와" },
    { value: "work", label: "작업하며 길게" },
  ]},
  { id: "bodyq", title: "바디감 선호?", advanced: true, options: [
    { value: "light", label: "가볍고 깔끔" },
    { value: "mid", label: "중간" },
    { value: "heavy", label: "묵직하고 진하게" },
  ]},
  { id: "level", title: "커피 경험은?", advanced: true, options: [
    { value: "beginner", label: "입문" },
    { value: "regular", label: "즐겨 마심" },
    { value: "geek", label: "스페셜티 좋아함" },
  ]},
];

// 향 태그(추천 카드의 flavors와 동일 어휘)
const F = {
  floral: "플로럴", fruity: "베리/과일", citrus: "시트러스",
  choco: "초콜릿", nutty: "견과", caramel: "카라멜", spice: "스파이스/허브", earthy: "어시/흙내음",
};

type Acc = { acidity: number[]; body: number[]; sweetness: number[]; roast: number[]; flavors: Record<string, number> };

function addFlavor(acc: Acc, name: string, w = 1) {
  acc.flavors[name] = (acc.flavors[name] ?? 0) + w;
}

export function buildProfile(ans: Answers) {
  const acc: Acc = { acidity: [], body: [], sweetness: [], roast: [], flavors: {} };
  const get = (id: string) => ans[id];

  switch (get("drink")) {
    case "americano": acc.body.push(0.4); acc.acidity.push(0.55); break;
    case "latte": acc.body.push(0.8); acc.sweetness.push(0.7); addFlavor(acc, F.choco, 1.5); addFlavor(acc, F.nutty); break;
    case "drip": acc.acidity.push(0.7); acc.body.push(0.4); addFlavor(acc, F.floral); addFlavor(acc, F.fruity); break;
    case "coldbrew": acc.body.push(0.6); acc.sweetness.push(0.6); addFlavor(acc, F.choco); addFlavor(acc, F.caramel); break;
    case "espresso": acc.body.push(0.85); addFlavor(acc, F.choco, 1.5); addFlavor(acc, F.caramel); break;
  }

  const moods = (get("mood") as string[]) || [];
  moods.forEach((m) => {
    if (m === "fruity") { acc.acidity.push(0.8); addFlavor(acc, F.fruity, 2); addFlavor(acc, F.citrus); }
    if (m === "floral") { acc.acidity.push(0.75); addFlavor(acc, F.floral, 2); }
    if (m === "choco") { acc.body.push(0.75); addFlavor(acc, F.choco, 2); addFlavor(acc, F.nutty); }
    if (m === "sweet") { acc.sweetness.push(0.8); addFlavor(acc, F.caramel, 2); }
    if (m === "heavy") { acc.body.push(0.85); acc.roast.push(0.8); addFlavor(acc, F.earthy); addFlavor(acc, F.spice); }
  });

  switch (get("acid")) {
    case "love": acc.acidity.push(0.85); break;
    case "mid": acc.acidity.push(0.5); break;
    case "no": acc.acidity.push(0.2); break;
  }
  switch (get("roast")) {
    case "light": acc.roast.push(0.2); acc.acidity.push(0.7); break;
    case "medium": acc.roast.push(0.5); break;
    case "dark": acc.roast.push(0.85); acc.body.push(0.7); addFlavor(acc, F.choco); break;
  }
  switch (get("sugar")) {
    case "sweet": acc.sweetness.push(0.85); break;
    case "any": acc.sweetness.push(0.5); break;
    case "clean": acc.sweetness.push(0.25); break;
  }
  // 더 자세히
  switch (get("time")) {
    case "morning": acc.acidity.push(0.6); break;
    case "aftermeal": acc.body.push(0.6); break;
    case "dessert": acc.sweetness.push(0.75); addFlavor(acc, F.caramel); break;
    case "work": acc.body.push(0.55); break;
  }
  switch (get("bodyq")) {
    case "light": acc.body.push(0.2); break;
    case "mid": acc.body.push(0.5); break;
    case "heavy": acc.body.push(0.85); break;
  }
  switch (get("level")) {
    case "geek": acc.acidity.push(0.7); addFlavor(acc, F.floral); addFlavor(acc, F.fruity); break;
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0.5);
  // 향 가중치 상위만 선호 태그로
  const flavors = Object.entries(acc.flavors).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);

  return {
    acidity: +avg(acc.acidity).toFixed(3),
    body: +avg(acc.body).toFixed(3),
    sweetness: +avg(acc.sweetness).toFixed(3),
    flavors,
  };
}
