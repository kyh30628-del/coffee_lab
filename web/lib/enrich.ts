// 카페 상세 강화 — 검증 리뷰에서 '의사결정 정보'(메뉴·시그니처·가격) 추출 + 평판 신선도·하락 감지. 토큰 0(규칙).

// ── 메뉴/시그니처 추출 ──────────────────────────────────────────────
const MENU_SUFFIX = "(라떼|라뗴|아메리카노|에스프레소|카푸치노|마키아토|마끼아또|콜드브루|콜드브루|드립커피|핸드드립|플랫화이트|에이드|스무디|프라페|밀크티|버블티|쉐이크|아인슈페너|크림커피|콜드브루|케이크|케익|티라미수|푸딩|타르트|소금빵|크림빵|단팥빵|휘낭시에|마들렌|크로플|크로핀|와플|마카롱|쿠키|스콘|도넛|도너츠|베이글|토스트|샌드위치|브런치|팬케이크|파르페|빙수|젤라또|아이스크림|초콜릿|쇼콜라|에그타르트|롤케이크|치즈케이크|당근케이크|바스크|크레페|뱅오쇼콜라|크루아상)";
const MENU_RE = new RegExp(`([가-힣A-Za-z]{1,8})\\s?${MENU_SUFFIX}`, "g");
const PLAIN_RE = new RegExp(MENU_SUFFIX, "g");
const MENU_STOP = new Set(["그냥", "보통", "여기", "이런", "저런", "다른", "추천", "인기", "대표", "시그니처", "오늘", "그날", "메뉴", "주문", "가격", "한잔", "하나", "이번", "신메뉴", "신상"]);

export function extractMenu(quotes: string[]): { items: string[]; signature: string | null } {
  const freq = new Map<string, number>();
  for (const q of quotes) {
    const t = String(q || "");
    // ① 수식어+메뉴어(흑임자라떼·수플레팬케이크) 우선
    for (const m of t.matchAll(MENU_RE)) {
      const pre = (m[1] || "").trim();
      const full = (pre + m[2]).replace(/\s/g, "");
      if (pre.length >= 1 && !MENU_STOP.has(pre) && full.length >= 3 && full.length <= 12) freq.set(full, (freq.get(full) ?? 0) + 1);
    }
    // ② 단독 메뉴어(소금빵·티라미수)도 카운트(수식어 없을 때 대표 가능)
    for (const m of t.matchAll(PLAIN_RE)) { const w = m[0].replace(/\s/g, ""); if (w.length >= 3) freq.set(w, (freq.get(w) ?? 0) + 1); }
  }
  // 한 항목이 다른 항목의 부분문자열이면(라떼⊂흑임자라떼) 더 구체적인 걸 우선
  const ranked = [...freq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  const items: string[] = [];
  for (const [w] of ranked) {
    if (items.some((it) => it.includes(w))) continue; // 이미 더 구체적인 게 있으면 스킵
    items.push(w);
    if (items.length >= 5) break;
  }
  return { items, signature: items[0] ?? null };
}

// ── 가격대 추출 ──────────────────────────────────────────────────────
export function extractPrice(quotes: string[]): string | null {
  const prices: number[] = [];
  for (const q of quotes) {
    const t = String(q || "");
    // 6,500원 / 6500원 / 6천원 / 6천5백원
    for (const m of t.matchAll(/([1-9][0-9]?)\s*천\s*(?:([1-9])\s*백)?\s*원/g)) prices.push(Number(m[1]) * 1000 + (m[2] ? Number(m[2]) * 100 : 0));
    for (const m of t.matchAll(/([2-9][0-9]{3}|[1-4][0-9]{4})\s*원/g)) prices.push(Number(m[1]));
  }
  const ok = prices.filter((p) => p >= 2000 && p <= 30000);
  if (ok.length < 2) return null;
  ok.sort((a, b) => a - b);
  const med = ok[Math.floor(ok.length / 2)];
  const band = Math.round(med / 1000);
  return `${band}천원대`;
}

// ── 평판 신선도·하락 감지 ───────────────────────────────────────────
const NEG = /(위생|벌레|바퀴|머리카락|불친절|불쾌|무뚝뚝|맛없|맛이\s*없|별로|실망|아쉽|최악|다신\s*안|두\s*번\s*다신|불결|더럽|비싸기만|가성비\s*별로|양\s*적|웨이팅만|불친절|시끄럽|시끄러|냄새|상한|눅눅|식었|기다리다\s*지침|불만)/;
const POS = /(맛있|친절|최고|존맛|또\s*가|재방문|만족|분위기\s*좋|좋았|훌륭|완벽|강추|인생\s*카페|단골)/;
const parseDates = (review_dates: any): number[] => {
  let d = review_dates;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch { return []; } }
  const arr: string[] = Array.isArray(d) ? d : (d && typeof d === "object" ? Object.values(d).flat() as string[] : []);
  return arr.map((x) => new Date(String(x).replace(/\./g, "-")).getTime()).filter((t) => !isNaN(t));
};

export function reputationSignals(quotes: string[], review_dates: any): { recentRatio: number; neg: number; pos: number; declineNote: string | null } {
  const ts = parseDates(review_dates);
  const recentRatio = ts.length ? ts.filter((t) => Date.now() - t < 365 * 86400000).length / ts.length : 1;
  let neg = 0, pos = 0;
  for (const q of quotes) { const t = String(q || ""); if (NEG.test(t)) neg++; if (POS.test(t)) pos++; }
  let declineNote: string | null = null;
  const total = quotes.length || 1;
  // 부정 신호가 의미있게 쌓였고 긍정 대비 비율이 높으면 = 평 갈림(보수적: neg>=3 & neg/총>=15% & neg>=pos*0.5)
  if (neg >= 3 && neg / total >= 0.15 && neg >= pos * 0.5) declineNote = "최근 평이 갈리는 신호(위생·응대·맛 등 부정 후기 일부)";
  else if (recentRatio < 0.15 && ts.length >= 5) declineNote = "최근 1년 새 후기 적음(평판 노후 가능)";
  return { recentRatio: Math.round(recentRatio * 100) / 100, neg, pos, declineNote };
}
