// ============================================================================
// 리뷰 품질 검증 엔진 (PRINCIPLES §1·§2·§7) — 이 서비스의 해자.
// "리뷰의 바다"에서 옥석을 가린다: 그 카페가 '주제'인 실제 후기만 남기고
//   - 나열식 글(추천 N곳·맛집모음)에 끼어 언급만 된 것
//   - 카페명만 스치고 내용 없는 글
//   - 일반 교양글·동명 카페·광고/체험단
// 을 걸러낸다. 모든 판정은 사람이 읽을 수 있는 '근거(reasons)'를 남긴다(투명성=신뢰).
//
// 규칙기반(결정적)이라 추적·재현 가능하고 무료·빠르며 Vercel에서 동작한다.
// 판정: verified(검증) / reference(참고) / rejected(탈락).
// ============================================================================

export type QualityVerdict = "verified" | "reference" | "rejected";
export type SourceKind = "google" | "blog" | "cafearticle" | "youtube" | "etc";

export type QualityInput = {
  title?: string;       // 글 제목 (블로그/카페글). 제목에 카페명 = 가장 강한 '주제성' 신호
  body: string;         // 본문/설명/리뷰 텍스트
  name: string;         // 카페명
  areaTerms?: string[]; // 지역어(동명 카페·관련성 검증)
  source: SourceKind;
};

export type QualityResult = {
  verdict: QualityVerdict;
  score: number;        // 0~100 (투명 점수)
  reasons: string[];    // 왜 이렇게 판정했는지 (화면 노출 가능)
  borderline?: boolean; // 카페명 불명확하나 카페후기 맥락 뚜렷 → LLM 재판정 대상
  signals: {
    nameInTitle: boolean; nameInBody: boolean; visit: boolean;
    substance: number; listicle: boolean; sponsored: boolean; areaMatch: boolean;
  };
};

// ---- 어휘 사전 ----
const VISIT_CUES = ["갔", "방문", "다녀", "마셨", "마시", "주문", "시켰", "들렀", "가봤", "재방문", "다시 가", "다녀왔",
  "앉아", "웨이팅", "줄 서", "예약하고", "visited", "ordered", "tried", "went", "stopped by", "i had", "we had"];

// 실제 경험·평가가 담겼는지 (감각/메뉴/서비스/공간 등 구체 신호)
const SUBSTANCE_CUES = [
  "맛", "원두", "라떼", "아메리카노", "에스프레소", "핸드드립", "드립", "디저트", "케이크", "빵", "스콘", "크로플",
  "분위기", "인테리어", "감성", "뷰", "테라스", "좌석", "자리", "주차", "사장님", "직원", "친절", "서비스",
  "메뉴", "가격", "가성비", "시그니처", "추천", "재방문", "존맛", "맛있", "별로", "아쉽", "최고", "내돈내산",
  "산미", "고소", "진한", "달달", "부드럽", "향", "온도", "플레이팅", "비주얼",
  "delicious", "flavor", "atmosphere", "cozy", "service", "menu", "price", "recommend"];

// 나열식/모음글 제목 패턴 (그 카페가 주제가 아니라 여럿 중 하나)
const LISTICLE_TITLE = [
  /\d+\s*(곳|군데|선|개)/, /(모음|총정리|정리|베스트|best|top\s*\d|리스트|모아|big\s*\d)/i,
  /맛집\s*(추천|모음|투어|리스트|지도)/, /(카페|디저트)\s*(추천|투어|모음|리스트|지도|코스)/, /핫플(레이스)?/,
];
// 본문에서 여러 가게가 함께 나열되는 신호 (…카페 / …점 / …커피 토큰 다수)
const PLACE_TOKEN = /[가-힣A-Za-z0-9]{2,}(카페|커피|로스터리|베이커리|디저트)\b/g;

const GENERIC_CUES = ["란 무엇", "이란?", "뜻과", "종류별", "조절하는 방법", "표현 방법", "하는 법",
  "what is", "how to", "guide to", "정의", "알아보", "효능", "원리", "역사"];

const AD = /(협찬|광고|체험단|제공받|원고료|소정의|무료로 제공|대가성|sponsored|paid partnership|ad\b)/i;

// 수도권 밖 주요 도시·도(이 DB는 수도권 전용 → 제목이 이 지역이면 동명 카페일 확률 높음)
const NON_METRO = ["충주", "청주", "충북", "충남", "대전", "세종", "천안", "아산", "대구", "부산", "울산", "포항",
  "경주", "창원", "김해", "진주", "전주", "군산", "익산", "전북", "전남", "여수", "순천", "목포", "광양",
  "강릉", "속초", "춘천", "원주", "강원", "제주", "서귀포", "통영", "안동", "구미", "경북", "경남", "양양", "거제", "사천"];

// 카페 맥락어 — 흔한 단어 이름(예: '리프레쉬')이 무관 글에 우연히 걸리는 것 방지용
const CAFE_WORDS = ["카페", "커피", "로스터리", "베이커리", "디저트", "에스프레소", "라떼", "아메리카노", "점", "coffee", "cafe"];

// 수도권 시·군·구 — 같은 상호의 '다른 지점'을 지역으로 구분하기 위함
const ALL_GU = [
  "강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중랑구",
  "수원시", "성남시", "고양시", "용인시", "부천시", "안산시", "안양시", "남양주시", "화성시", "평택시", "의정부시", "시흥시", "파주시", "김포시", "광명시", "광주시", "군포시", "하남시", "오산시", "양주시", "구리시", "안성시", "포천시", "의왕시", "여주시", "동두천시", "과천시", "이천시", "양평군", "가평군", "연천군",
  "미추홀구", "연수구", "남동구", "부평구", "계양구", "강화군", "옹진군",
];
const guShort = (g: string) => g.replace(/(특별시|광역시|시|군|구)$/, "");

const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "");
const has = (t: string, kws: string[]) => kws.some((k) => t.includes(k.toLowerCase()));
const countOccur = (t: string, kw: string) => kw ? t.split(kw).length - 1 : 0;

const GENERIC_SUFFIX = /(카페|커피|로스터리|베이커리|디저트|coffee|cafe|점|본점)$/i;
const GENERIC_WORD = new Set(["카페", "커피", "점", "본점", "로스터리", "베이커리", "디저트", "coffee", "cafe"]);
const LOC_SUFFIX = /(역|동|구|시|군|읍|면|로|길|가)$/; // 지역어 접미

// 카페명 '구별 토큰' = 일반어·지역어·대상지역어를 뺀 고유 식별어.
// 예: "을지로 문덕카페" → ["문덕"] ("을지로"는 위치어로 제거).
function coreTokens(name: string, areaTerms: string[]): string[] {
  const an = areaTerms.map((a) => norm(a)).filter(Boolean);
  return name.split(/\s+/)
    .map((t) => t.replace(GENERIC_SUFFIX, "").trim())
    .filter((t) => t.length >= 2)
    .filter((t) => !GENERIC_WORD.has(t.toLowerCase()))
    .filter((t) => !an.some((a) => a.includes(norm(t)) || norm(t).includes(a)))
    .filter((t) => !LOC_SUFFIX.test(t));
}

export function verifyReview(input: QualityInput): QualityResult {
  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  const reasons: string[] = [];
  const fullL = `${title} ${body}`.toLowerCase();
  const titleN = norm(title), bodyN = norm(body);
  const nameN = norm(input.name);
  const areaTerms = input.areaTerms ?? [];
  const sponsored = AD.test(fullL);

  // ---- 구글 실제 방문 리뷰: 장소에 직접 달린 리뷰이므로 신뢰. 내용량만 본다 ----
  if (input.source === "google") {
    const substance = SUBSTANCE_CUES.filter((k) => fullL.includes(k.toLowerCase())).length;
    const sig = { nameInTitle: false, nameInBody: true, visit: true, substance, listicle: false, sponsored, areaMatch: true };
    if (body.length < 8) return { verdict: "rejected", score: 0, reasons: ["내용 거의 없음(구글)"], signals: sig };
    if (sponsored) reasons.push("광고/협찬 신호");
    reasons.push("구글 실제 방문 리뷰");
    const score = Math.min(100, 60 + substance * 8 + Math.min(body.length, 120) / 6);
    return { verdict: body.length >= 15 ? "verified" : "reference", score: Math.round(score), reasons, signals: sig };
  }

  // ---- 블로그/카페글: 주제성 + 내용성 + 관련성 검증 ----
  // 구별 토큰(지역어·일반어 제거). 토큰이 비면 전체 이름으로만 매칭.
  const tokens = coreTokens(input.name, areaTerms);
  const distinct = tokens.length ? tokens : (nameN ? [input.name] : []);
  const inTitleFull = !!nameN && titleN.includes(nameN);
  const inBodyFull = !!nameN && bodyN.includes(nameN);
  const distinctInTitle = distinct.some((tk) => titleN.includes(norm(tk)));
  const distinctInBody = distinct.some((tk) => bodyN.includes(norm(tk)));
  const visit = has(fullL, VISIT_CUES);
  const substance = SUBSTANCE_CUES.filter((k) => fullL.includes(k.toLowerCase())).length;
  const areaPresent = areaTerms.length ? areaTerms.some((a) => `${title} ${body}`.includes(a)) : false;
  // [#4] 흔한 단어 이름 오매칭 방지: 전체 이름 일치는 강함. 토큰만 일치면
  //     '카페 맥락(카페·커피·로스터리…)'이나 지역이 함께 있어야 주제로 인정.
  const titleHasCafeWord = CAFE_WORDS.some((w) => title.includes(w));
  const bodyHasCafeWord = CAFE_WORDS.some((w) => body.includes(w));
  const nameInTitle = inTitleFull || (distinctInTitle && (titleHasCafeWord || areaPresent));
  const nameInBody = inBodyFull || (distinctInBody && (bodyHasCafeWord || areaPresent));
  const listicle = LISTICLE_TITLE.some((re) => re.test(title)) || (((`${title} ${body}`.match(PLACE_TOKEN) ?? []).length) >= 4);
  const generic = has(fullL, GENERIC_CUES);
  const nameOccurBody = nameN ? countOccur(bodyN, nameN) : 0;
  const foreignInTitle = NON_METRO.find((c) => title.includes(c));
  // [#5] 수도권 내 동명 '다른 지점': 대상 시·군·구를 알 때, 제목에 다른 시·군·구가
  //     박히고 대상 지역어가 어디에도 없으면 다른 지점으로 보고 배제.
  const targetShorts = ALL_GU.map(guShort).filter((s) => s.length >= 2 && areaTerms.some((a) => a.includes(s)));
  const otherGuInTitle = targetShorts.length
    ? ALL_GU.map(guShort).find((s) => s.length >= 2 && !targetShorts.includes(s) && title.includes(s) && !areaTerms.some((a) => a.includes(s)))
    : undefined;

  const sig = { nameInTitle, nameInBody, visit, substance, listicle, sponsored, areaMatch: areaPresent };

  // ---- 하드 탈락(명백한 노이즈) ----
  if (!nameInTitle && !nameInBody) {
    // 이름은 안 잡혀도 '카페 방문 후기 맥락'이 뚜렷하면 버리지 않고 LLM 재판정 대상으로(경계).
    const ctx = (visit || substance >= 2) && (areaPresent || titleHasCafeWord || bodyHasCafeWord) && !listicle;
    return ctx
      ? { verdict: "rejected", score: 22, reasons: ["카페명 불명확하나 후기 맥락 있음(LLM 재판정 대상)"], borderline: true, signals: sig }
      : { verdict: "rejected", score: 0, reasons: ["카페명이 제목·본문에 없음(무관/동명)"], signals: sig };
  }
  // 동명 카페: 제목이 수도권 밖 도시인데 대상 지역어가 어디에도 없음 → 다른 지역 동명점
  if (foreignInTitle && !areaPresent) {
    return { verdict: "rejected", score: 5, reasons: [`다른 지역 동명 카페 추정(제목 '${foreignInTitle}')`], signals: sig };
  }
  // 수도권 내 다른 시·군·구의 동명 지점
  if (otherGuInTitle && !areaPresent) {
    return { verdict: "rejected", score: 8, reasons: [`다른 지점 추정(제목 '${otherGuInTitle}', 대상 지역 언급 없음)`], signals: sig };
  }
  if (generic && !nameInTitle) {
    return { verdict: "rejected", score: 5, reasons: ["일반 교양/정보글(그 카페 후기 아님)"], signals: sig };
  }
  if (listicle && !nameInTitle) {
    return { verdict: "rejected", score: 10, reasons: ["나열식 모음글에 언급만 됨(주제 아님)"], signals: sig };
  }
  if (!visit && substance === 0) {
    return { verdict: "rejected", score: 10, reasons: ["방문·경험·평가 내용 없음(언급만)"], signals: sig };
  }

  // ---- 점수화(투명) ----
  let score = 0;
  if (inTitleFull) { score += 42; reasons.push("제목이 이 카페 (주제 글)"); }
  else if (nameInTitle) { score += 30; reasons.push("제목에 카페명 일부"); }
  else if (nameInBody) { score += 14; reasons.push("본문에 카페명 언급"); }

  if (visit) { score += 24; reasons.push("실제 방문 단서"); }
  if (substance >= 3) { score += 24; reasons.push(`구체 후기 신호 ${substance}개`); }
  else if (substance === 2) { score += 16; reasons.push("구체 후기 신호 2개"); }
  else if (substance === 1) { score += 8; reasons.push("구체 후기 신호 1개"); }

  if (areaPresent) { score += 8; reasons.push("지역 일치"); }
  if (body.length >= 60) score += 5;
  else if (body.length < 25) { score -= 10; reasons.push("내용 짧음"); }

  // ---- 감점 ----
  if (listicle) { score -= 22; reasons.push("모음글 성격(주제 분산)"); }
  if (!nameInTitle && body.length > 180 && nameOccurBody <= 1) { score -= 16; reasons.push("긴 글에 한 번만 스침"); }
  if (sponsored) { score -= 10; reasons.push("광고/협찬 신호"); }
  if (((fullL.match(/#/g) ?? []).length) > 8) { score -= 8; reasons.push("해시태그 과다(홍보성)"); }

  score = Math.max(0, Math.min(100, score));

  // ---- 판정 ----
  // 검증(verified)은 '제목이 이 카페가 주제'인 글로 한정(옥석: 본문에 스친 모음·expo 배제).
  // 본문에만 언급된 글은 내용이 좋아도 참고(reference)까지만 — 합성·집계엔 검증분만 쓴다.
  let verdict: QualityVerdict;
  if (score >= 60 && nameInTitle && (visit || substance >= 1)) verdict = "verified";
  else if (score >= 38 && (nameInTitle || nameInBody)) verdict = "reference";
  else { verdict = "rejected"; reasons.push("종합 품질 미달"); }

  return { verdict, score: Math.round(score), reasons, signals: sig };
}
