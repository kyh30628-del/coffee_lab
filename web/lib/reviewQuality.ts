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
// 진짜 광고/협찬 신호(불명확한 '광고' 단독 제외) — 검증 후기에서 제외 대상.
const AD_STRONG = /(협찬|체험단|제공\s*받|원고료|소정의|대가성|대가를?\s*받|무료로?\s*제공|유료\s*광고|광고\s*입니다|sponsored|paid partnership)/i;
// 면책 문구 = '명시적 부인'만 인정('협찬 없이'·'광고 아님'·'협찬x'·'비협찬'). 진짜 후기이므로 제외 안 함.
//   ⚠️ '내돈내산'은 면책 아님 — '체험단으로 갔지만 (이전엔)내돈내산' 같이 실제 협찬받은 글에도 붙으므로,
//      능동적 협찬신호(체험단·협찬받음·제공받음)가 있으면 제외(엄격 — 진짜 후기 해자).
const AD_DISCLAIM = /(협찬|광고|제공|대가|유료)\s*(아닌|아니|아님|없이|없는|없습니다|없음|받지\s*않)|협찬\s*x|비협찬/;

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

// 단어 경계 매칭: term이 더 긴 한글/영숫자 단어의 '일부'로 박힌 경우 제외.
//   예: '바이트'가 '에이바이트키친'·'남산바이트'의 일부면 불인정. (조사는 뒤에 붙으니 '앞 글자'만 검사)
function boundedHit(rawText: string, term: string): boolean {
  const t = rawText || "", q = (term || "").trim();
  if (!q) return false;
  let i = t.indexOf(q);
  while (i !== -1) {
    const before = i > 0 ? t[i - 1] : " ";
    if (!/[가-힣a-zA-Z0-9]/.test(before)) return true; // 앞이 경계(공백·구두점·시작)면 진짜 매칭
    i = t.indexOf(q, i + 1);
  }
  return false;
}
// 짧은 이름(≤4)은 경계 매칭(부분문자열 오매칭 방지), 긴 이름은 일반 정규화 매칭.
function nameHit(rawText: string, normText: string, term: string): boolean {
  const tn = norm(term);
  if (!tn) return false;
  return tn.length > 4 ? normText.includes(tn) : boundedHit(rawText, term);
}

const GENERIC_SUFFIX = /(카페|커피|로스터리|로스터스|로스터즈|로스터|로스팅|베이커리|디저트|케이크|케익|케잌|제과점|제과|과자점|베이킹|coffee|cafe|cake|roasters?|roastery|roasteries|점|본점)$/i;
const GENERIC_WORD = new Set(["카페", "커피", "점", "본점", "로스터리", "로스터스", "로스터즈", "로스터", "로스팅", "베이커리", "디저트", "케이크", "케익", "케잌", "제과", "제과점", "과자점", "베이킹", "coffee", "cafe", "cake", "roasters", "roaster", "roastery", "roasteries", "책방", "북카페"]);
// 너무 흔해서 '식별어'가 못 되는 형용사·일반어. 이것만 남으면 전체 이름 일치를 요구(오매칭 방지).
// 예: "좋은커피" → 접미 '커피' 제거 후 '좋은'만 남는데, '분위기 좋은 카페'처럼 모든 후기에 나옴.
const NAME_STOPWORD = new Set(["좋은", "맛있는", "맛있는집", "예쁜", "멋진", "행복", "행복한", "우리", "우리집", "작은", "큰", "조용한", "따뜻한", "정직한", "데일리", "오늘", "하루", "그날", "모닝", "감성", "분위기", "힐링", "달콤한", "새로운",
  // 음료·메뉴명 — 모든 카페 후기에 등장하므로 식별어 불가(예: '아메리카노' 카페는 모든 후기와 매칭됨)
  "아메리카노", "라떼", "에스프레소", "카푸치노", "카페라떼", "콜드브루", "바닐라라떼", "카라멜마키아토", "플랫화이트", "카페모카", "모카", "아인슈페너", "마키아토", "콘파나", "디카페인", "녹차라떼", "초코라떼", "밀크티",
  // 일상어·슬랭이라 식별어가 못 됨(예: '갈비탕에 홀릭된', '에어컨 스팀', '소나무 너머', '제품 시연') → 전체 이름 일치 요구
  "홀릭", "스팀", "소나무", "시연", "보고", "어울림",
  // 케이크·베이커리 '스타일/카테고리' 수식어 — 식별어 불가(예: '얼로브케이크 레터링케이크'에서 접미 '케이크' 제거 후 '레터링'만
  //   남으면 '강동구 레터링케이크' 들어간 경쟁업체 후기가 전부 매칭됨, 실측). 고유어(얼로브)만 매칭하도록 이것만 남으면 전체이름 요구.
  "레터링", "수제", "쁘띠", "도시락", "주문제작", "맞춤", "기념일", "생일", "답례", "답례떡", "떡케이크", "쌀케이크", "당근", "치즈케이크", "티라미수",
  // 일반 '장소유형'어 — 단독으론 식별어 불가(예: '아트홀 갤러리 카페'에 '롯데갤러리 아트홀 잠실점' 후기가 딸려옴).
  //   이것만 남으면 전체 이름 일치 요구 → 딴 아트홀·갤러리·미술관 후기 오염 차단. (진짜 식별어 붙은 '정갤러리'는 한 토큰이라 영향 없음)
  "아트홀", "갤러리", "미술관", "박물관", "공연장", "전시관", "전시장", "아트센터", "문화센터", "문화회관", "컨벤션센터", "복합문화공간", "아트스페이스"]);
const LOC_SUFFIX = /(역|동|구|시|군|읍|면|로|길|가)$/; // 지역어 접미

// 한 건물·복합시설에 여러 가게가 모인 '위치 수식어'(카페명에 들어가도 식별어 아님).
// 같은 시설 안 다른 가게 후기가 딸려오는 오염 방지(예: '앤티앤스 스타필드 위례' ← '스타필드'는 식별어 아님).
// ⚠️ 브랜드의 일부인 단어(대학=와플대학, 센터=센터커피, 상가=몽상가)는 넣지 않는다. '브랜드 토큰 남을 때만 제거' 안전장치와 함께 동작.
const VENUE_WORDS = [
  // 백화점·쇼핑몰·아울렛·마트
  "스타필드", "타임빌라스", "롯데몰", "롯데백화점", "롯데마트", "롯데프리미엄", "롯데아울렛", "현대백화점", "현대시티", "현대프리미엄", "더현대", "신세계백화점", "신세계", "이마트", "트레이더스", "홈플러스", "코스트코", "타임스퀘어", "아이파크몰", "스퀘어원", "엔터식스", "갤러리아", "아울렛", "프리미엄아울렛", "이케아", "가든파이브", "디큐브", "에이케이플라자", "akplaza", "세이브존", "뉴코아", "모다아울렛",
  // 푸드코트·식품관(몰 내부 구역)
  "푸드코트", "푸드애비뉴", "푸드홀", "잇토피아", "식품관", "스위트파크",
  // 휴게소·터미널·공항·역사(교통 복합시설)
  "휴게소", "고속터미널", "종합터미널", "터미널", "도심공항", "공항", "역사", "환승센터",
  // 병원·대학·문화/영화관(복합 건물)
  "병원", "대학교", "캠퍼스", "롯데시네마", "cgv", "메가박스", "아쿠아리움", "컨벤션",
  // 호텔·타워·전통시장
  "호텔", "타워", "광장시장", "통인시장",
];
// 신도시·생활권 수식어(시·군·구가 아닌 동네名) — 위치 수식어로만 작동
const DISTRICT_WORDS = ["위례", "미사", "다산", "별내", "광교", "동탄", "운정", "송도", "청라", "영종", "마곡", "지축", "삼송", "향동", "고덕", "감일", "갈매", "한강신도시", "위례신도시"];
const isVenueTok = (t: string) => { const n = norm(t); return VENUE_WORDS.some((v) => n.includes(norm(v))) || DISTRICT_WORDS.some((d) => n.includes(norm(d))); };

// 지역/생활권/신도시 이름 — 카페명 식별 토큰이 '못' 된다.
//   예: "평촌커피" → 접미 '커피' 제거 후 '평촌'만 남는데, '평촌'은 그 지역 모든 카페 후기에 나옴
//   → 식별어로 쓰면 평촌 지역 아무 카페·심지어 콜밴·샷시수리 글까지 매칭됨(실측 392/632 오통과).
//   이런 토큰만 남으면 coreEmpty 처리 → '전체 이름 원문 일치'만 인정(오매칭 차단).
//   ⚠️ 시·군·구는 areaTerms로 이미 걸러지므로 여기엔 '구보다 작은 생활권·신도시·역세권' 위주로 둔다.
const AREA_NAME = new Set([
  ...DISTRICT_WORDS,
  // 안양·군포·의왕
  "평촌", "산본", "인덕원", "범계", "관양", "호계",
  // 부천·광명·시흥
  "중동", "상동", "소사", "철산", "하안", "배곧", "정왕", "은계", "장현",
  // 고양·파주
  "일산", "백석", "마두", "주엽", "대화", "화정", "행신", "능곡", "삼송", "원흥", "지축", "탄현", "식사", "풍산", "교하",
  // 성남·용인·수원
  "분당", "판교", "정자", "서현", "수내", "야탑", "이매", "죽전", "수지", "기흥", "동백", "영통", "광교", "권선", "인계",
  // 남양주·구리·하남
  "다산", "별내", "갈매", "평내", "호평", "덕소", "미사", "위례", "감일", "교산",
  // 의정부·양주·동두천·포천
  "옥정", "회천", "고읍", "민락", "녹양",
  // 김포·인천
  "구래", "장기", "운양", "풍무", "한강신도시", "마산", "송도", "청라", "영종", "검단", "논현", "서창",
]);
const isAreaTok = (t: string) => { const n = norm(t); return n.length >= 2 && (AREA_NAME.has(t) || [...AREA_NAME].some((a) => norm(a) === n)); };

// 카페명 '구별 토큰' = 일반어·지역어·대상지역어를 뺀 고유 식별어.
// 예: "을지로 문덕카페" → ["문덕"]("을지로" 제거).
// 몰/신도시어(스타필드·위례 등)는 '다른 브랜드 토큰이 남을 때만' 위치수식어로 제거한다.
//   - "앤티앤스 스타필드 위례" → ["앤티앤스"] (브랜드 남음 → 몰/신도시 제거)
//   - "미사강변 북카페" → ["미사강변"] (브랜드 없음 → '미사강변'이 유일 정체성이므로 유지)
export function coreTokens(name: string, areaTerms: string[]): string[] {
  // 행정 접미사(시·군·구·읍·면·동·리)를 뗀 변형도 비교군에 포함 → 지점명에서 나온 병합 지역어
  //   ('남양주오남점'→'남양주오남')를 areaTerms('남양주시'·'오남읍')와 매칭시켜 식별어에서 제외.
  //   (프랜차이즈 'OO점'이 같은 지역 다른 업종 'OO점' 리뷰를 끌어오던 동명 오염의 근본 차단)
  const stripAdmin = (n: string) => { const s = n.replace(/(특별시|광역시|시|군|구|읍|면|동|리)$/, ""); return s.length >= 2 && s !== n ? s : ""; };
  const an = areaTerms.flatMap((a) => { const n = norm(a); const s = stripAdmin(n); return s ? [n, s] : [n]; }).filter(Boolean);
  // 접미(점·카페 등) 제거 '전' 원본 토큰도 함께 보관 → venue 검사는 원본에도 적용
  // (예: '롯데백화점'에서 '점'이 떨어져 '롯데백화'가 되면 venue 매칭을 빠져나가는 것 방지)
  // 공백뿐 아니라 한글↔영문/숫자 경계로도 분리 → '노원두물마루COFFEESNACK'처럼 붙은 이름에서
  //   한글 식별어('노원두물마루')를 분리(영문 접미사 통째로 토큰화돼 일치율 0 되는 오판 방지).
  // 지점 표식('○○점')에서 나온 토큰 = 지점 랜드마크(봉천·뱅뱅사거리·신대방삼거리·수원). 브랜드가 아니라
  //   같은 자리 다른 업체와 공유하는 위치어 → 식별 매칭에서 제외(브랜드 토큰만 남을 때). '코르누코피아 뱅뱅사거리점'에
  //   딸려오던 '자연곳간 뱅뱅사거리점' 같은 옆가게 오염의 근본 차단. (브랜드가 없으면 위치어라도 정체성이므로 유지)
  //   ⚠️ 지점 검출은 '공백 단어' 단위로 — '상암DMC점'은 한글↔영문 분리로 [상암,DMC,점]이 돼 점 표식을 잃으므로,
  //   분리 전에 단어가 '점'으로 끝나는지를 먼저 판정해 하위 토큰 전체에 branch 플래그를 내린다.
  const isBranchWord = (w: string) => /점$/.test(w) && !GENERIC_WORD.has(norm(w)) && w.replace(GENERIC_SUFFIX, "").trim().length >= 1;
  const parts = name.split(/\s+/).flatMap((w) => { const branch = isBranchWord(w);
      return w.split(/(?<=[가-힣])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[가-힣])/).map((raw) => ({ raw, branch })); })
    .map(({ raw, branch }) => ({ raw, core: raw.replace(GENERIC_SUFFIX, "").trim(), branch }))
    .filter(({ core }) => core.length >= 2)
    .filter(({ core }) => !GENERIC_WORD.has(core.toLowerCase()))
    .filter(({ core }) => !NAME_STOPWORD.has(core.toLowerCase()))
    .filter(({ core }) => !isAreaTok(core)) // 지역·생활권명은 식별어 불가(평촌·일산·분당…) → 빠지면 전체이름 일치 요구
    .filter(({ core }) => !an.some((a) => a.includes(norm(core)) || norm(core).includes(a)))
    .filter(({ core }) => !LOC_SUFFIX.test(core));
  const nonBranch = parts.filter((p) => !p.branch);
  const pool = nonBranch.length ? nonBranch : parts; // 지점어만 있는 이름(브랜드 없음)은 그대로 유지
  const base = pool.map((p) => p.core);
  const branded = pool.filter((p) => !isVenueTok(p.raw) && !isVenueTok(p.core)).map((p) => p.core);
  return branded.length ? branded : base; // 브랜드 토큰이 남으면 venue/신도시 제거, 없으면 원래 유지
}

// 노이즈 게이트: 후기들이 '실제로 그 카페'를 말하는 비율(이름 일관성).
//   개별 verifyReview를 통과해도, 묶어 보면 카페명이 거의 안 나오면 오염 의심.
//   유형별 규칙으로 못 잡은 오염(부분문자열·구문·신종)을 공개 전에 잡는 안전망.
export function nameCoherence(name: string, quotes: string[]): number {
  const qs = (quotes || []).filter(Boolean);
  if (!qs.length) return 1; // 표본 없으면 보류(공개 막지 않음)
  const toks = coreTokens(name, []);
  const terms = toks.length ? toks : [name];
  const nameN = norm(name); // 전체 이름(붙여쓰기) — '성북동빵공장'처럼 토큰 경계검사가 놓치는 경우 보완
  let hit = 0;
  for (const q of qs) {
    const qN = norm(q);
    if ((nameN.length >= 4 && qN.includes(nameN)) || terms.some((t) => nameHit(q, qN, t))) hit++;
  }
  return hit / qs.length;
}

export function verifyReview(input: QualityInput): QualityResult {
  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  const reasons: string[] = [];
  const fullL = `${title} ${body}`.toLowerCase();
  const titleN = norm(title), bodyN = norm(body);
  const nameN = norm(input.name);
  const areaTerms = input.areaTerms ?? [];
  // 진짜 광고/협찬(면책 문구 제외)이면 검증 후기에서 제외 — 랜딩 약속('광고·협찬 자동 제외')과 일치.
  const sponsored = AD_STRONG.test(fullL) && !AD_DISCLAIM.test(fullL);
  if (sponsored) return { verdict: "rejected", score: 0, reasons: ["광고·협찬 글 — 자동 제외"], signals: { nameInTitle: false, nameInBody: false, visit: false, substance: 0, listicle: false, sponsored: true, areaMatch: false } };

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
  const coreEmpty = tokens.length === 0; // 이름이 흔한구문/일반어뿐(예: '좋은커피') → 원문 '붙임' 일치만 인정
  // 🛡️ 짧은 단일토큰('나무 로스터리'→["나무"])은 다른 업체('나무사이로')의 '부분문자열'로 오매칭됨.
  //   → 토큰 대신 '전체 이름(정규화)' 일치만 인정해 차단. (전체이름이 토큰보다 길 때만 = 한 글자 가게 제외)
  const nameRawN = norm(input.name);
  const onlyTok = tokens.length === 1 ? norm(tokens[0]) : "";
  // 짧은 단일토큰(≤2자)뿐 아니라 '숫자만'인 단일토큰('102커피'→"102")도 약함 — 주소 번지('102호')·다른 업체에
  //   오매칭됨. → 전체 이름('102커피') 원문 일치만 인정해 차단.
  const weakSingle = onlyTok.length >= 1 && (onlyTok.length <= 2 || /^[0-9]+$/.test(onlyTok)) && nameRawN.length > onlyTok.length;
  const reqFull = coreEmpty || weakSingle;
  const distinct = tokens.length ? tokens : (nameN ? [input.name] : []);
  // 흔한구문 이름은 띄어쓰기 보존이 핵심: '좋은커피'(가게)는 원문에 붙어서, '좋은 커피'(맛 표현)는 배제.
  //   짧은 단일토큰은 정규화 전체이름 일치(나무로스터리)로 — 부분문자열 오매칭 차단.
  const inTitleFull = coreEmpty ? title.includes(input.name) : weakSingle ? titleN.includes(nameRawN) : nameHit(title, titleN, input.name);
  const inBodyFull = coreEmpty ? body.includes(input.name) : weakSingle ? bodyN.includes(nameRawN) : nameHit(body, bodyN, input.name);
  // 지역어 제외한 고유 식별 토큰 — 지역어만 제목에 있는 건 nameInTitle 기여 안 함
  const nonAreaTokens = tokens.filter((tk) => !areaTerms.some((a) => norm(a).includes(norm(tk)) || norm(tk).includes(norm(a))));
  const identTokens = nonAreaTokens.length ? nonAreaTokens : tokens; // 비면 원래대로
  const distinctInTitle = reqFull ? inTitleFull : identTokens.some((tk) => nameHit(title, titleN, tk));
  const distinctInBody = reqFull ? inBodyFull : distinct.some((tk) => nameHit(body, bodyN, tk));
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
  // ★ 핵심 규칙: 제목이 '다른 카페'를 선언 — 우리 카페는 본문에 잠깐 언급된 것.
  //   카페힌트 있는 긴 제목인데 우리 카페 고유명(비지역 토큰)이 제목에 없으면 → 다른 카페 후기.
  //   예) "오렌지어웨이크에서 라떼" → body에 커피스탑 있어도 reject
  if (!inTitleFull && nameInBody && titleHasCafeWord && title.length > 10) {
    // 지역어가 아닌 고유 토큰이 제목에 있어야 우리 카페 글로 인정
    const LOC_LIKE = /^(서울|경기|인천|부산|광화문|홍대|강남|신촌|이태원|합정|연남|성수|건대|혜화|압구정|청담|종로|명동|마포|여의도|잠실|판교|분당|수원|일산|상암|공덕|망원|을지로|동대문|신림|노원|구로|가산|당산|영등포|신도림|용산|왕십리|서초|방배|사당|구리|하남|의정부|부천|안양|평택|송파)$/;
    // inTitleFull이 false지만 listicle이거나 제목이 단순 탐방형(지역+카페만)이면 통과
    const simpleAreaTitle = /^[가-힣\s]+\s*(카페|커피)\s*(추천|탐방|맛집|top\d*|best|\d+선|필수|명소|핫플)/i.test(title)
      || /^(카페|커피)\s*(추천|탐방|맛집|top\d*|best|\d+선)/i.test(title);
    const specificInTitle = inTitleFull || simpleAreaTitle || tokens
      .filter(tk => tk.length >= 2 && !LOC_LIKE.test(tk))
      .some(tk => nameHit(title, titleN, tk) || titleN.includes(norm(tk)));
    if (!specificInTitle) {
      return { verdict: "rejected", score: 3, reasons: ["제목이 다른 카페를 가리킴(우리 카페는 본문에만 언급)"], signals: sig };
    }
  }
  // 동명 카페: 제목이 수도권 밖 도시인데 대상 지역어가 어디에도 없음 → 다른 지역 동명점
  if (foreignInTitle && !areaPresent) {
    return { verdict: "rejected", score: 5, reasons: [`다른 지역 동명 카페 추정(제목 '${foreignInTitle}')`], signals: sig };
  }
  // 수도권 내 다른 시·군·구의 동명 지점
  if (otherGuInTitle && !areaPresent) {
    return { verdict: "rejected", score: 8, reasons: [`다른 지점 추정(제목 '${otherGuInTitle}', 대상 지역 언급 없음)`], signals: sig };
  }
  // 지점(브랜치) 구분: 이 카페가 '○○점'이면, 후기가 '이 지점(지점명·지역)'을 가리켜야 인정.
  //   다른 지점명(예: '마곡점')이 박혀 있고 이 지점 신호가 없으면 다른 지점 후기 → 배제.
  const myBranch = input.name.match(/([가-힣A-Za-z0-9]{2,})점\s*$/)?.[1];
  if (myBranch) {
    const fullT = `${title} ${body}`;
    const branchSignal = (myBranch !== "본" && fullT.includes(myBranch)) || areaPresent; // 지점명 또는 대상 지역어
    const NON_BRANCH = /^(장점|단점|시점|관점|초점|약점|강점|정점|요점|중점|종점|만점|채점|별점|평점|빵점|백점|영점|매점|거점|기점|이점|반점|중간점|문제점|차이점|공통점|장단점)$/;
    const otherBranchTok = (fullT.match(/([가-힣]{2,})점/g) ?? [])
      .map((t) => t.replace(/점$/, ""))
      .find((nm) => nm.length >= 2 && nm !== myBranch && nm !== "본" && !NON_BRANCH.test(nm + "점")
        && !input.name.includes(nm) && !areaTerms.some((a) => a.includes(nm) || nm.includes(guShort(a))));
    if (otherBranchTok && !branchSignal) {
      return { verdict: "rejected", score: 6, reasons: [`다른 지점 후기('${otherBranchTok}점', 이 지점 신호 없음)`], signals: sig };
    }
    // 브랜드만 일치하고 '이 지점' 신호가 전혀 없음 → verified 불가, 경계(LLM이 지점 확인)
    if (!branchSignal && (visit || substance >= 1)) {
      return { verdict: "rejected", score: 20, reasons: ["지점 불명확(브랜드만 일치) — LLM이 지점 확인"], borderline: true, signals: sig };
    }
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
