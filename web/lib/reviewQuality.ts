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

import { getLearned } from "./learnedTerms";

export type QualityVerdict = "verified" | "reference" | "rejected";
export type SourceKind = "google" | "blog" | "cafearticle" | "youtube" | "etc";

export type QualityInput = {
  title?: string;       // 글 제목 (블로그/카페글). 제목에 카페명 = 가장 강한 '주제성' 신호
  body: string;         // 본문/설명/리뷰 텍스트
  name: string;         // 카페명
  areaTerms?: string[]; // 지역어(동명 카페·관련성 검증)
  addr?: string;        // 카페 등록주소(도로명) — 리뷰 주소 불일치 검증용
  link?: string;        // 출처 URL — 비방문 게시판(중고나라·창업나무 등) 판별용
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
// 룰갭 제안14(2026-07-03): 카페 모음글·신상카페 리스트·체험단 모집 컬렉션 글 — 나열된 여러 카페 중 하나가
//   글 어딘가에 스쳐 nameInTitle/nameInBody를 우회해 raw_reviews에 통째로 딸려오던 오염(전국 7,027개 카페 확인).
//   "N곳 카페/맛집" 등 오탐 위험 있는 패턴은 제외하고 안전 키워드만 우선 적용(제안서 권고 — 규모 큼, 단계 적용).
const CAFE_LIST_PATTERNS = /(신상\s*카페\s*리스트|체험단\s*(모음|모집)|인기글\s*top\s*\d+|전국\s*인기\s*카페\s*순위|카페플렉스\s*인기글)/i;
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
const AD_DISCLAIM = /(협찬|광고|제공|대가|유료|체험단|서포터즈?|기자단)\s*([xX✕✖]|아닌|아니|아님|없이|없는|없습니다|없음|받지\s*않)|비협찬/;
// coord#112(2026-07-05): 지자체 서포터즈·시민/블로그 기자단 등 '위촉형 대가성 홍보글'이 방문후기(verified)로 혼입.
//   협찬/체험단 문구는 걸러지나 서포터즈·기자단 위촉 문구는 통과 → 22곳(검증 8곳) 오염 확인. 위촉 역할어를 협찬과 동급 처리.
//   ⚠️ '서포터즈 모임을 했어요' 같은 손님 후기 오탐 방지: 필자 역할(활동·위촉·선정·모집)·기관위촉 신호가 붙을 때만.
const SUPPORTER_PR = /(서포터즈|시민\s*기자단|블로그\s*기자단|대학생\s*기자단|SNS\s*서포터|온라인\s*서포터|홍보\s*서포터|우수\s*서포터|홍보\s*대사|서포터로?\s*(선정|위촉|활동|참여|뽑)|기자단\s*(활동|으로|에\s*선정|모집|위촉)|위촉장)/;
// 식당 메인 메뉴어(카페 아닌 '음식점' 시그널). 같은 상호 다른 음식점('장꼬방'+'묵은김치찌개') 후기 분리용.
//   카페가 흔히 파는 것(토스트·샌드위치·파스타·브런치)은 제외 — 명백한 한식·중식 '식당 본메뉴'만.
const RESTAURANT_MAIN_SRC = "(묵은김치|김치찌개|된장찌개|부대찌개|동태찌개|순두부찌개|순두부|찌개|찌게|백반|국밥|순대국|해장국|감자탕|짜장면|짜장|짬뽕|탕수육|보쌈|족발|곱창|막창|삼겹살|갈비탕|갈비찜|불고기|제육|돈가스|돈까스|냉면|칼국수|쌈밥|한정식|매운탕|추어탕|설렁탕|곰탕|닭갈비|찜닭|아구찜|해물찜|쌀국수|분식)";
const RESTAURANT_MAIN = new RegExp(RESTAURANT_MAIN_SRC);
const RESTAURANT_MAIN_ADJ = "[가-힣]{0,4}" + RESTAURANT_MAIN_SRC;

// 수도권 밖 주요 도시·도(이 DB는 수도권 전용 → 제목이 이 지역이면 동명 카페일 확률 높음)
const NON_METRO = ["충주", "청주", "충북", "충남", "대전", "세종", "천안", "아산", "대구", "부산", "울산", "포항",
  "경주", "창원", "김해", "진주", "전주", "군산", "익산", "전북", "전남", "여수", "순천", "목포", "광양",
  "강릉", "속초", "춘천", "원주", "강원", "제주", "서귀포", "통영", "안동", "구미", "경북", "경남", "양양", "거제", "사천"];

// 카페 맥락어 — 흔한 단어 이름(예: '리프레쉬')이 무관 글에 우연히 걸리는 것 방지용
const CAFE_WORDS = ["카페", "커피", "로스터리", "베이커리", "디저트", "에스프레소", "라떼", "아메리카노", "coffee", "cafe"];

// 거래·판매·홍보 양식 글(후기 아님) — 중고거래·판매글이 흔한단어 카페명에 우연히 걸림('와이드'↔중고 모니터).
//   카페 맥락어가 전혀 없을 때만 적용해 진짜 후기('가격·판매대'를 언급한 후기)는 보존.
//   강력신호(중고거래 플랫폼·판매양식 등)는 진짜 카페 후기엔 절대 안 나오므로 가드 없이 탈락.
// 룰갭 제안28(2026-07-05): joonggonara·changupnamu는 '카페(coffee)'가 아니라 '카페(네이버 카페=커뮤니티)'
//   판매게시판이라 UI 정형문구("타카페", "카페 연동")에 리터럴 "카페"가 박혀 CAFE_WORDS 가드를 우회 —
//   COMMERCE_JUNK의 !titleHasCafeWord/!bodyHasCafeWord 가드 없이 STRONG으로 승격해 무조건 탈락.
const COMMERCE_STRONG = /(중고나라|당근\s*마켓|번개장터|판매\s*양식|미개봉|택배\s*신청\s*하기|삽니다|팝니다|총판\s*문의|타\s*카페|카페\s*연동)/;
// 비방문 판매게시판(네이버 카페=커뮤니티, 회원끼리 물건 거래) — 도메인 성격상 방문 후기가 나올 수 없어 링크만으로 하드 탈락.
const NONVISIT_BOARD = /cafe\.naver\.com\/(joonggonara|changupnamu)\//i;
const COMMERCE_JUNK = /(중고\s*거래|직거래|택배\s*(거래|비)|판매\s*(합니다|중입니다|글|가격|처)|구해요|구합니다|분양\s*(합니다|중|가)|새\s*상품|정품\s*인증|택포|계좌\s*(번호|이체)|입금\s*(계좌|확인|자)|견적\s*문의|도매상|인치\s*(모니터|tv|티비))/i;
// 비카페 업종 선언어 — 제목이 다른 업종(음식점·미용·의료·운동·숙박 등)을 가리킴.
//   우리 카페 고유명이 제목에 없고 카페맥락어도 없으면 → 같은 자리/무관 다른 업체 글(옆가게 오염).
//   ★ 뷰티·웰니스 군(에스테틱·피부관리·경락·윤곽관리…) — 카페명이 그 상호 일부('봄날 에스테틱')라 nameInTitle을
//     우회해 '제목이 이 카페'로 verified되던 경로 차단. CAFE_CONTEXT 가드가 진짜 카페 후기는 보호(2026-06-28).
//   ★ 룰갭 제안13(2026-07-03): 공방·봉사단 — 카페명을 공유하는 동명 서예학원·봉사단체("라온제나 공방",
//     "라온제나봉사단") 활동기록이 nameInTitle로 딸려오던 오염 차단. CAFE_CONTEXT_STRONG 가드가 보호.
const NONCAFE_BIZ = /(스시|초밥|칼국수|국밥|설렁탕|곰탕|냉면|삼겹|고깃집|고기집|곱창|막창|횟집|회집|포차|이자카야|타코|부리또|쌀국수|라멘|라면집|우동|소바|규동|텐동|덮밥|분식|떡볶이|김밥집|만두집|돈까스|돈가스|짬뽕|마라탕|족발|보쌈|치킨집|피자집|미용실|헤어샵|헤어룸|네일|속눈썹|왁싱|필라테스|헬스장|피트니스|요가원|치과|한의원|정형외과|이비인후과|피부과|약국|학원|공방|봉사단|봉사회|동아리|동호회|독서실|고시원|펜션|모텔|숙박|부동산|공인중개|정육|마트|세차|에스테틱|피부관리|얼굴관리|바디관리|윤곽관리|웨딩관리|경락|반영구|체형교정|도수치료|태닝|마사지샵|슈가링|제모|두피문신|타투이스트|네일샵|골프연습장|스크린골프|골프존|골프레슨|골프아카데미|골프스쿨|실내골프|요양원|요양병원|방문요양|주간보호|요양센터|데이케어|납골당|봉안당|추모공원|묘지|수목장|상조|장례식장|인력사무소|직업소개소)/;
// 비카페 '주제' 글(문학·독서·게임·미디어) — 카페 이름이 유명 시/제목/문구('비에도 지지않고'=미야자와 겐지 시)일 때
//   그 시·책·게임 인용 글이 이름 매칭으로 딸려오는 오염 차단. 강한 비카페 주제 마커.
const OFFTOPIC_TOPIC = /(미야자와|겐지|그림책|동화책|독서모임|북클럽|독후감|감상문|시집|소설책|에세이집|문학상|월드컵|올림픽|성배전쟁|붕괴\s*\d|원신|게임\s*(이벤트|공략|패치|리뷰)|콘서트\s*후기|앨범\s*리뷰|컴백|뮤직비디오|드라마\s*리뷰|웹툰|넷플릭스|바람에도\s*지지|폭풍에도\s*지지|더위에도\s*지지|눈에도\s*지지|눈보라에도|뮤지컬\s*(관람|후기|티켓|캐스팅|넘버|커튼콜|공연|무대)|연극\s*(관람|후기|무대|공연)|생생정보|골목식당|수요미식회|맛있는\s*녀석들|공연\s*(소식|일정|예약|취소|관람)|백종원의|예능\s*(재방송|본방송|다시보기)|\d+회\s*\d+화)/;
// 지역 SEO 서비스 홍보 블로그 — 법률·시공·의료·청소 등 비카페 서비스 SEO 글이 카페명(일상어)을 제목에 끼워 오염(이해·공유·유지…).
const LOCAL_SEO_SERVICES = /(개인회생|채무조정|파산신청|전세사기|보증금반환|명도소송|이혼소송|교통사고\s*변호사|형사전문|법률상담|샤시교체|창호견적|도배시공|입주청소|이사비용|하수구\s*뚫|누수탐지|배관수리|보일러수리|설비업체|임플란트\s*시술|성형수술|도수치료|비수술치료|산후조리|피부관리\s*시술|탈모치료|치아교정|렌탈정수기|법무사|등기대행|세무대리|노무상담|하자보수|줄눈시공|곰팡이제거|에어컨청소|입주\s*청소|상조\s*가입|법무법인|상간녀소송|상간남소송|음주운전\s*변호사|강제추행\s*변호사|성범죄\s*전문\s*변호사|성범죄변호사|수임료|포장이사|유품정리|변기막힘|하수구청소|결로공사|고독사청소|특수청소|웨딩홀|예식장|스드메)/;
// 진짜 카페 글이면 거의 항상 들어가는 '강한 카페 맥락'(점·일반어 제외 — 오탐 방지)
const CAFE_CONTEXT = /(카페|커피|라떼|아메리카노|에스프레소|콜드브루|핸드드립|디저트|케이크|베이커리|메뉴판?|음료|원두|바리스타|좌석|매장|사장님|주문|아인슈페너|브런치|로스팅|카공|cafe|coffee|latte)/i;
// 룰갭 제안15: 1~2글자/일반어 카페명은 SEO·무관 글에 '문장 성분'으로 우연일치 → 카페 맥락 없으면 오염. (길이≤2 + 아래 3+글자 일반어)
const COMMON_WORD_NAMES = new Set(["일상적", "마찬가지", "그리고", "오래오래", "이러쿵", "어쩌면", "자수성가", "멍하니", "오늘의날씨", "소소한일상", "하루에", "여기서", "인디고"]);
// ★ 비카페 업종이 '제목을 지배'할 때의 가드 — 매장·음료·주문·메뉴·좌석은 피부관리/필라테스 등 비카페도 흔히 써서
//   가드를 뚫는다('피부관리 하이드뷰티…매장 전화번호'→결). 이 경로엔 진짜 커피전문 어휘(카페·커피·디저트·원두…)만 인정(2026-06-28).
const CAFE_CONTEXT_STRONG = /(카페|커피|라떼|아메리카노|에스프레소|콜드브루|핸드드립|디저트|케이크|베이커리|빵|제과|원두|바리스타|아인슈페너|브런치|로스팅|카공|cafe|coffee|latte)/i;

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
  "아트홀", "갤러리", "미술관", "박물관", "공연장", "전시관", "전시장", "아트센터", "문화센터", "문화회관", "컨벤션센터", "복합문화공간", "아트스페이스",
  // 다중단어 이름에 붙는 '만남/소통' 정서어 — 단독 토큰이면 식별어 불가(예: '카페 에클레시아 담소'의 '담소'는
  //   '차 마시며 담소' 같은 무관 글에도 흔해 그 한 토큰만 일치해도 코어토큰 매칭이 통과되던 오염 차단). [룰갭20]
  "담소", "소통", "나눔"]);
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
  // 구조·테마 수식어(같은 유형 다른 가게와 공유 — 식별어 불가): '옛날에 한옥카페'가 '풍물기행 한옥카페' 리뷰를 끌어오던 오염 차단
  "한옥", "고택", "정원", "농원", "수목원", "식물원", "온실", "루프탑", "옥상", "테라스", "한옥카페", "감성카페", "대형카페", "정원카페", "마을",
];
// 신도시·생활권 수식어(시·군·구가 아닌 동네名) — 위치 수식어로만 작동
const DISTRICT_WORDS = ["위례", "미사", "다산", "별내", "광교", "동탄", "운정", "송도", "청라", "영종", "마곡", "지축", "삼송", "향동", "고덕", "감일", "갈매", "한강신도시", "위례신도시"];
// 대학교 축약명(기관명 카테고리, 룰갭 제안3): "OO대학교"·"캠퍼스"는 VENUE_WORDS로 걸리지만 축약명("성신여대")은
//   안 걸려 identity 토큰으로 남던 것 차단(id15727 더베이크 성신여대 운정그린캠퍼스점 실측 — 지역일치만으로
//   캠퍼스 주차·행정·동아리 무관글 유입). 브랜드 토큰이 남을 때만 위치수식어로 제거(isVenueTok과 동일 원리).
const UNIV_ABBR_WORDS = [
  "서울대", "연세대", "고려대", "이화여대", "성신여대", "한양대", "성균관대", "경희대", "중앙대", "홍익대",
  "숙명여대", "숭실대", "국민대", "동국대", "건국대", "세종대", "명지대", "광운대", "덕성여대", "동덕여대",
  "상명대", "가천대", "인하대", "아주대", "단국대", "한국외대", "서강대", "서울여대", "삼육대", "총신대",
  "한성대", "서경대", "협성대", "루터대", "감신대", "장신대",
];
const isVenueTok = (t: string) => { const n = norm(t); return VENUE_WORDS.some((v) => n.includes(norm(v))) || DISTRICT_WORDS.some((d) => n.includes(norm(d))) || UNIV_ABBR_WORDS.some((u) => n.includes(norm(u))); };

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

// 카페명 끝에 붙은 'SEO 서술어 꼬리'(원두·핸드드립·로스팅·베이커리·브런치…)를 제거해 진짜 상호만 남긴다.
//   네이버 상호를 '구구커피 원두 핸드드립 로스팅'처럼 키워드로 등록한 카페가, 그 일반어를 '식별토큰'으로 삼아
//   다른 로스터리 후기를 무더기 매칭하고 nameCoherence 게이트(원두·핸드드립이 1.0으로 부풀림)까지 뚫던 오염의 근본 차단.
//   ⚠️ '꼬리'만 제거(앞 토큰은 보존), 전부 서술어면(예:'원두로스팅카페') 원본 유지 — 단일 상호('커피나무')는 손대지 않음. (2026-06-28)
const NAME_DESC_TAIL = new Set(["원두", "핸드드립", "핸드드립커피", "드립", "드립커피", "로스팅", "로스터리", "로스터스", "로스터즈", "로스터", "베이커리", "브런치", "디저트", "디저트카페", "스페셜티", "에스프레소", "아메리카노", "라떼", "콜드브루", "홈카페", "제과", "제과점", "케이크", "케익", "케잌", "베이킹", "커피전문점", "전문점", "핸드메이드", "수제", "수제청", "커피", "카페"]);
export function cleanCafeName(name: string): string {
  const parts = (name || "").trim().split(/\s+/);
  let end = parts.length;
  while (end > 1 && NAME_DESC_TAIL.has(parts[end - 1])) end--;
  const cleaned = parts.slice(0, end).join(" ").trim();
  return cleaned.length >= 2 ? cleaned : name; // 비면 원본 보존(파괴 금지)
}

// 카페명 '구별 토큰' = 일반어·지역어·대상지역어를 뺀 고유 식별어.
// 예: "을지로 문덕카페" → ["문덕"]("을지로" 제거).
// 몰/신도시어(스타필드·위례 등)는 '다른 브랜드 토큰이 남을 때만' 위치수식어로 제거한다.
//   - "앤티앤스 스타필드 위례" → ["앤티앤스"] (브랜드 남음 → 몰/신도시 제거)
//   - "미사강변 북카페" → ["미사강변"] (브랜드 없음 → '미사강변'이 유일 정체성이므로 유지)
// venueOnly: 남은 토큰이 전부 다중테넌트 기관/건물명(VENUE_WORDS·대학 축약명 등)일 때 true — 그 건물엔
//   무관한 여러 시설이 함께 있으므로(제안3 "건물단위 앵커 필수화"), 지역일치만으로 식별 인정하면 안 된다.
function coreTokensDetail(name: string, areaTerms: string[]): { tokens: string[]; venueOnly: boolean } {
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
  // 브랜드 토큰이 남으면 venue/신도시 제거, 없으면(=venueOnly) 원래 유지해 정체성 파괴는 막되 신호는 표시.
  return { tokens: branded.length ? branded : base, venueOnly: branded.length === 0 && base.length > 0 };
}
export function coreTokens(name: string, areaTerms: string[]): string[] {
  return coreTokensDetail(name, areaTerms).tokens;
}

// 노이즈 게이트: 후기들이 '실제로 그 카페'를 말하는 비율(이름 일관성).
//   개별 verifyReview를 통과해도, 묶어 보면 카페명이 거의 안 나오면 오염 의심.
//   유형별 규칙으로 못 잡은 오염(부분문자열·구문·신종)을 공개 전에 잡는 안전망.
export function nameCoherence(name: string, quotes: string[], areaTerms: string[] = []): number {
  const qs = (quotes || []).filter(Boolean);
  if (!qs.length) return 1; // 표본 없으면 보류(공개 막지 않음)
  // ⚠️ areaTerms를 넘겨야 지역어('사가정'·'진리')가 식별토큰에서 빠진다 — 안 넘기면 지역어가 같은 동네
  //   다른 업체(사가정 만두집·미용실) 리뷰와 매칭돼 오염 카페가 일치율 100%로 게이트를 통과한다.
  const toks = coreTokens(name, areaTerms);
  const terms = toks.length ? toks : [name];
  const nameN = norm(name); // 전체 이름(붙여쓰기) — '성북동빵공장'처럼 토큰 경계검사가 놓치는 경우 보완
  let hit = 0;
  for (const q of qs) {
    const qN = norm(q);
    if ((nameN.length >= 4 && qN.includes(nameN)) || terms.some((t) => nameHit(q, qN, t))) hit++;
  }
  return hit / qs.length;
}

// 🚫 명백한 비-카페 스팸 — 카페 방문후기엔 절대 안 나오는 강한 오프토픽(코인·해외선물·거래소·부동산 분양·대출·재개발 등).
//   블로그가 다른 주제 글에 카페명만 우연히 스쳐 오염되는 케이스(예: 카페클로버에 붙은 '코인 거래소'·'주상복합 분양' 글).
//   ⚠️ 오탐 방지: 단일 애매어(코인·분양 단독) 금지 — 카페후기엔 안 나오는 '복합 신호'만.
// coord/결재#153(2026-07-05): coreTokens가 업종어·형용사·지역어를 걷어낸 뒤 아래 초약체 단어만 '유일
//   식별토큰'으로 남아 전국 무관 콘텐츠와 오매칭(1854·15327·17868·2772·15229·14839 등, 대부분 이미 비공개).
//   curated 화이트리스트(오탐 확대 방지) — 이게 유일 토큰이면 숫자·2자토큰과 동급 '약함' 처리:
//   전체이름 원문일치 + 지역어 동반을 요구(둘 중 하나라도 없으면 nameInTitle/Body 불인정).
const WEAK_IDENTITY_TOKEN = new Set(["공간", "다이아", "블라블라", "충무", "브라더스", "2005", "인테리어"]);
const OFFTOPIC_SPAM = /(코인\s*해외선물|해외\s*선물\s*(거래|시세|투자|매매)|선물\s*거래소|암호화폐|가상화폐|비트코인|비트겟|바이낸스|재테크\s*(추천|비법|정보|수익)|주식\s*(리딩|종목추천|투자문의|급등주)|대출\s*(상담|한도|이자|갈아타기|추천)|아파트\s*분양|오피스텔\s*분양|분양가|모델하우스|청약\s*(가점|통장|경쟁률)|재개발\s*(구역|조합|호재)|재건축\s*(조합|아파트|호재)|입주\s*예정|주상복합\s*분양|최고\s*\d+\s*층|\d+\s*개동)/;

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
  const supporterPR = SUPPORTER_PR.test(fullL) && !AD_DISCLAIM.test(fullL); // coord#112: 서포터즈·기자단 위촉 홍보글
  if (sponsored || supporterPR) return { verdict: "rejected", score: 0, reasons: [supporterPR && !sponsored ? "서포터즈·기자단 위촉 홍보글 — 자동 제외" : "광고·협찬 글 — 자동 제외"], signals: { nameInTitle: false, nameInBody: false, visit: false, substance: 0, listicle: false, sponsored: true, areaMatch: false } };

  // [비방문 게시판] 중고나라·창업나무는 물건 거래·상권 문의 게시판(네이버 카페=커뮤니티)이라 방문 후기가 있을 수 없음.
  //   내용에 카페 맥락어가 섞여도(리터럴 "카페" 오탐) 링크 도메인만으로 무조건 탈락.
  if (input.link && NONVISIT_BOARD.test(input.link)) {
    return { verdict: "rejected", score: 0, reasons: ["비방문 게시판(중고나라·창업나무) — 자동 제외"], signals: { nameInTitle: false, nameInBody: false, visit: false, substance: 0, listicle: false, sponsored: false, areaMatch: false } };
  }

  // [비-카페 스팸] 코인·해외선물·부동산분양·대출 등 카페와 무관한 강한 오프토픽 — 블로그가 카페명만 우연히 스친 오염. 규칙 하드거절.
  if (OFFTOPIC_SPAM.test(fullL)) {
    return { verdict: "rejected", score: 0, reasons: ["비-카페 스팸(코인·부동산·대출 등 무관 글) — 자동 제외"], signals: { nameInTitle: false, nameInBody: false, visit: false, substance: 0, listicle: false, sponsored: false, areaMatch: false } };
  }

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
  // [카페 모음글] 제목이 컬렉션 아티팩트(신상카페 리스트·체험단 모음/모집…) 패턴이면 카페명 언급 여부와
  //   무관하게 거절 — 그 카페가 주제가 아니라 나열된 다수 중 하나일 뿐(제안14).
  if (CAFE_LIST_PATTERNS.test(title)) {
    return { verdict: "rejected", score: 2, reasons: ["카페 모음글·리스트(그 카페가 주제 아님)"], signals: { nameInTitle: false, nameInBody: false, visit: false, substance: 0, listicle: true, sponsored: false, areaMatch: false } };
  }
  // 구별 토큰(지역어·일반어 제거). 토큰이 비면 전체 이름으로만 매칭.
  const { tokens, venueOnly } = coreTokensDetail(input.name, areaTerms);
  const coreEmpty = tokens.length === 0; // 이름이 흔한구문/일반어뿐(예: '좋은커피') → 원문 '붙임' 일치만 인정
  // 🛡️ 짧은 단일토큰('나무 로스터리'→["나무"])은 다른 업체('나무사이로')의 '부분문자열'로 오매칭됨.
  //   → 토큰 대신 '전체 이름(정규화)' 일치만 인정해 차단. (전체이름이 토큰보다 길 때만 = 한 글자 가게 제외)
  const nameRawN = norm(input.name);
  const onlyTok = tokens.length === 1 ? norm(tokens[0]) : "";
  // 짧은 단일토큰(≤2자)뿐 아니라 '숫자만'인 단일토큰('102커피'→"102")도 약함 — 주소 번지('102호')·다른 업체에
  //   오매칭됨. → 전체 이름('102커피') 원문 일치만 인정해 차단.
  const weakWhitelist = onlyTok.length >= 1 && WEAK_IDENTITY_TOKEN.has(onlyTok); // #153 초약체 유일토큰
  const weakSingle = onlyTok.length >= 1 && (onlyTok.length <= 2 || /^[0-9]+$/.test(onlyTok) || weakWhitelist) && nameRawN.length > onlyTok.length;
  // 결재#157: 이름이 '카페 801, 인테리어'처럼 개별 약한토큰 여럿으로 쪼개지면(["801,","인테리어"])
  //   onlyTok(단일토큰)이 비어 weakSingle/weakWhitelist가 무력화 — 이미 등재된 초약체 화이트리스트가
  //   토큰이 2개 이상이라는 이유만으로 뚫린다. 토큰 전부가 숫자(구두점 부산물 제외)이거나
  //   WEAK_IDENTITY_TOKEN이면 다중토큰도 동급 '약함'으로 보고 전체이름 원문일치를 요구.
  const allTokensWeak = tokens.length >= 1 && tokens.every((tk) => {
    const n = norm(tk).replace(/[,.:;·\-]+$/, "");
    return /^[0-9]+$/.test(n) || WEAK_IDENTITY_TOKEN.has(n);
  });
  const reqFull = coreEmpty || weakSingle || allTokensWeak;
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
  // #153: 초약체 유일토큰(공간·인테리어·2005…)은 지역어 동반 없으면 전국 오매칭이라 귀속 불인정
  // 🏢 제안3(건물단위 앵커 필수화): 남은 토큰이 전부 다중테넌트 기관/건물명(VENUE_WORDS·대학 축약명 등)이면
  //   그 건물엔 무관한 여러 시설(주차·행정·동아리…)이 함께 있으므로, 지역일치만으로는 부족 — 진짜 카페 맥락
  //   (CAFE_CONTEXT_STRONG)이 함께 있어야 그 건물의 '이 카페' 이야기로 인정한다(전체이름 원문일치는 예외 — 이미 강한 신호).
  const venueCtxOk = !venueOnly || CAFE_CONTEXT_STRONG.test(fullL);
  // 📮 [주소=상호] 카페명이 '도로명주소'(예: '대산로 511', '중부대로 33-1')면, 그 이름은 같은 자리 이웃
  //   업체(메밀촌·마라탕…)가 '주소'로 흔히 적는 공유 문자열이라, 이름 일치만으로 귀속하면 옆가게 후기가
  //   딸려온다(id16359 실측, coord#126 P1). → 진짜 카페 맥락(CAFE_CONTEXT_STRONG)이 함께 있어야만
  //   이 카페 후기로 인정(주소만 스친 이웃업체 글 차단). 실제 카페 후기는 항상 카페 맥락을 동반하므로 안전.
  const nameIsRoadAddr = /^[가-힣A-Za-z0-9]{1,12}(로|길)\s*\d+(-\d+)?$/.test(input.name.trim());
  const roadAddrCtxOk = !nameIsRoadAddr || CAFE_CONTEXT_STRONG.test(fullL);
  const nameInTitle = (weakWhitelist && !areaPresent) ? false : (roadAddrCtxOk && (inTitleFull || (distinctInTitle && (titleHasCafeWord || areaPresent) && venueCtxOk)));
  const nameInBody = (weakWhitelist && !areaPresent) ? false : (roadAddrCtxOk && (inBodyFull || (distinctInBody && (bodyHasCafeWord || areaPresent) && venueCtxOk)));
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

  // 🌍 [동음이의 지명] 카페 식별토큰이 '해외 지명'과 겹치면(콜롬보=스리랑카 수도, id7272 실측) 여행·현지
  //   맥락에서 그 토큰만 우연 일치해 해외 여행기가 딸려온다. 우리 지역어도 없고 카페 맥락(CAFE_CONTEXT_STRONG)도
  //   없이 '해외 지명 맥락'만 있으면 이 카페 후기가 아님. curated 화이트리스트(오탐 확대 방지) — 진짜 카페
  //   후기는 카페 맥락을 동반하므로 걸리지 않는다. (coord#126 P3)
  const FOREIGN_HOMONYM = new Set(["콜롬보"]);
  if (tokens.length && tokens.every((t) => FOREIGN_HOMONYM.has(norm(t))) && !areaPresent
      && !CAFE_CONTEXT_STRONG.test(fullL)
      && /(스리랑카|여행기|해외여행|배낭여행|현지인|수도\s|항공권|비행기|공항|배낭|입국|환전)/.test(fullL)) {
    return { verdict: "rejected", score: 3, reasons: ["동음이의 해외 지명(카페 아님)"], signals: sig };
  }

  // ---- 하드 탈락(명백한 노이즈) ----
  // [거래·판매 글] 후기가 아님. 강력신호(중고나라·판매양식…)는 진짜 후기엔 안 나오므로 가드 없이 탈락.
  //   ('와이드'↔'와이드 19인치 중고나라 판매양식' 본문의 '타카페'가 카페맥락으로 오인돼 빠져나가던 것 차단)
  //   약한 거래신호는 카페 맥락어가 전혀 없을 때만 탈락(가격·판매대 언급한 진짜 후기 보존).
  if (COMMERCE_STRONG.test(fullL) || (COMMERCE_JUNK.test(fullL) && !titleHasCafeWord && !bodyHasCafeWord)) {
    return { verdict: "rejected", score: 0, reasons: ["거래·판매 글(후기 아님)"], signals: sig };
  }
  // [비카페 업종] 제목이 다른 업종(스시·칼국수·미용실·병원…)을 선언하고, 우리 카페 고유명도 카페맥락어도
  //   제목에 없음 → 같은 자리/무관 다른 업체 글. 본문에 우리 카페가 언급되면 '같이 간 글'일 수 있어
  //   하드탈락 대신 LLM 경계로(진짜 후기 보호), 본문에도 없으면 무관 글로 탈락.
  if (NONCAFE_BIZ.test(title) && !nameInTitle && !titleHasCafeWord) {
    return nameInBody
      ? { verdict: "rejected", score: 18, reasons: ["제목은 다른 업종이나 본문에 카페 언급 — LLM 재판정"], borderline: true, signals: sig }
      : { verdict: "rejected", score: 4, reasons: ["다른 업종 글(제목이 비카페 업종)"], signals: sig };
  }
  // [동명 비카페 업체] 비카페 업종어가 제목에 있고 카페맥락(커피·라떼·디저트…)이 글 전체에 전무하면,
  //   카페명이 그 업체 상호 일부로 포함돼 nameInTitle을 우회해도 배제(봄날←필라테스 더 봄날, 마중←바다마중 횟집).
  //   가드: CAFE_CONTEXT가 하나라도 있으면 진짜 카페 후기로 보고 통과(혼재 업체·실제 후기 보호 → 오탐 차단).
  if (NONCAFE_BIZ.test(title) && !CAFE_CONTEXT_STRONG.test(fullL)) {
    return { verdict: "rejected", score: 4, reasons: ["동명 비카페 업체(업종어 지배·카페맥락 전무)"], signals: sig };
  }
  // [글루드 동명 업체] 카페명이 '다른 상호의 일부'로만 등장(다올→다올커텐) + 카페맥락 전무 → 다른 업체.
  //   카페명 바로 뒤 글자가 '조사'가 아닌 한글이면 글루드(다른 단어). 독립 출현(조사·경계) 0 + 글루드 2+ 일 때만(보수).
  if (!/\s/.test(input.name.trim()) && input.name.trim().length >= 2 && !CAFE_CONTEXT.test(fullL)) {
    const nm0 = input.name.trim();
    const rawT = `${title} ${body}`;
    const PART = "이가은는을를에의도만로와과랑까부터요입예네죠및한"; // 조사·종결 시작 글자(독립 출현 보호)
    // 룰갭 제안1 부가: PART 시작 글자가 흔한 명사(가구·과일·로봇·도넛·한강 등)의 첫 글자와 겹쳐, 그 명사가
    //   이어 붙어도 '조사 시작'으로 오판해 글루드가드를 우회하던 문제(르씨엘→"르씨엘가구점" 실측). 이
    //   명사들로 시작하면 PART 매치여도 글루드로 판정.
    const GLUED_NOUN_PREFIX = ["가구", "과일", "로봇", "도넛", "한강"];
    let glued = 0, clean = 0, i = 0;
    while ((i = rawT.indexOf(nm0, i)) >= 0) {
      const after = rawT.slice(i + nm0.length);
      const c = after[0] || "";
      if (GLUED_NOUN_PREFIX.some((p) => after.startsWith(p))) glued++;
      else if (!c || !/[가-힣]/.test(c) || PART.includes(c)) clean++;
      else glued++;
      i += nm0.length;
    }
    if (glued >= 2 && clean === 0) {
      return { verdict: "rejected", score: 4, reasons: ["글루드 동명 업체(카페명이 다른 상호의 일부)"], signals: sig };
    }
  }
  // [룰갭 제안1] inTitleFull(제목=카페명 완전/짧은토큰 일치) 신뢰 경로엔 CAFE_CONTEXT 게이트가 없어,
  //   흔한 일반어·브랜드어 카페명(비바체·헌터스·르씨엘 등)이 가구점·전자담배·유소년축구단·넷플릭스
  //   애니메이션·반려용품 브랜드 등과 겹치면 본문에 카페 맥락이 전무해도 +42점을 받아 검증(verified)까지
  //   도달했다(rulegap-proposals-20260706.md 제안1, 실측 3곳). 영향범위가 커서 단계 적용: 이름 4자 이하
  //   또는 WEAK_IDENTITY_TOKEN급(초약체 유일토큰)부터만 게이트 — 이름 3자 이하는 더 엄격한 STRONG 요구.
  //   하드 탈락 대신 borderline(LLM 재판정)으로 격하 — 표현이 달라 걸리지 않은 진짜 카페 후기를 보호.
  const nameNoSpace = nameN.replace(/\s/g, "");
  if (inTitleFull && ((nameNoSpace.length >= 1 && nameNoSpace.length <= 4) || weakWhitelist)) {
    const ctxGate = nameNoSpace.length <= 3 ? CAFE_CONTEXT_STRONG : CAFE_CONTEXT;
    if (!ctxGate.test(fullL)) {
      return { verdict: "rejected", score: 20, reasons: ["제목=카페명 일치하나 카페 맥락 전무(흔한 이름·타업종 혼입 의심) — LLM 재판정"], borderline: true, signals: sig };
    }
  }
  // [인물 직함 블로그] 카페명이 미용·의료 개인 직함(팀장·원장·디자이너 등)+서비스어와 결합 + 카페맥락 전무 → 개인 블로그(테오 팀장).
  const PERSON_TITLE_RE = /(팀장|원장|수석\s*디자이너|담당\s*디자이너|디자이너|실장|강사|코치|점장)\s*(님|입니다|인데|블로그|시술|복구|매직|교정|관리|상담|케어|예약|디자인|이에요|에요)/;
  if (PERSON_TITLE_RE.test(`${title} ${body}`) && !CAFE_CONTEXT.test(fullL)) {
    return { verdict: "rejected", score: 5, reasons: ["인물 직함 블로그(미용·의료 개인 — 카페 아님)"], signals: sig };
  }
  // [비카페 주제 글] 문학·독서·게임·미디어 주제(시·그림책·게임 등)가 강하게 드러나는데 '카페 맥락어가
  //   전혀 없음' → 카페 이름이 유명 문구라서 딸려온 글(비에도지지않고=시). 카페 맥락 있으면 보존.
  if (OFFTOPIC_TOPIC.test(fullL) && !CAFE_CONTEXT.test(fullL)) {
    return { verdict: "rejected", score: 3, reasons: ["비카페 주제 글(문학·게임·미디어·뮤지컬·방송)"], signals: sig };
  }
  // [nameAsWord 오염 — 룰갭 제안15] 1~2글자/일반어 카페명(이해·봄·탐·결·수·목이·일상적…)이 법률·의료·시공·운송 SEO나
  //   무관 글에 '문장 성분(동사/형용사)'으로 우연일치해 통과하던 것 차단. 짧은/일반어 이름 + 카페 맥락(CAFE_CONTEXT·카페어)
  //   전무 → 카페와 무관한 글로 거절. 진짜 후기는 카페 맥락어가 있어 보존(tsx 실측: 이해 43·봄 64·탐 46건 유지). 정상 이름(3+글자)은 영향 없음.
  const nameClean = (nameN || "").replace(/\s/g, "");
  const nameRisky = (nameClean.length >= 1 && nameClean.length <= 2) || COMMON_WORD_NAMES.has(nameClean);
  //   룰갭 제안22(b): 이 게이트만 CAFE_CONTEXT_STRONG 사용 — CAFE_CONTEXT의 "주문·좌석·매장·사장님·음료"는
  //   비카페 소매/서비스 전반의 범용어라 관용구 카페명(자수성가 등)의 무관 글을 못 걸러냄(전역 적용은 비권장).
  if (nameRisky && !CAFE_CONTEXT_STRONG.test(fullL) && !titleHasCafeWord && !bodyHasCafeWord) {
    return { verdict: "rejected", score: 2, reasons: ["초단어·일반어 카페명 우연일치(카페 맥락 전무) — nameAsWord 오염"], signals: sig };
  }
  // [지역 SEO 서비스 블로그] 법률·시공·의료·청소 SEO 글이 카페명(일상어)을 제목에 끼움 + 카페맥락 전무 → 무관 홍보글(이해·공유·유지…).
  if (LOCAL_SEO_SERVICES.test(`${title} ${body}`) && !CAFE_CONTEXT.test(fullL) && !bodyHasCafeWord) {
    return { verdict: "rejected", score: 3, reasons: ["지역 SEO 서비스 홍보 블로그(카페 무관)"], signals: sig };
  }
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
  // 신도시·생활권(청라·송도·동탄 등) 동명 지점: 제목에 '점'이 안 붙어도, 다른 생활권名이 박히고
  //   대상 지역어(시·동)가 어디에도 없으면 다른 지점/동명 카페로 본다. (areaTerms에 우리 동洞 포함 → 우리 생활권은 제외됨)
  const otherDistrictInTitle = [...DISTRICT_WORDS, ...getLearned("district")].find((d) => title.includes(d) && !areaTerms.some((a) => a.includes(d)));
  if (otherDistrictInTitle && !areaPresent) {
    return { verdict: "rejected", score: 7, reasons: [`다른 생활권 동명 카페 추정(제목 '${otherDistrictInTitle}', 대상 지역 언급 없음)`], signals: sig };
  }
  // 일반어 '○○점'(지점명이 아님) 제외 — 합성어 오매칭 차단. 예: 음식점·전문점·정기점(검)·관점·시점…
  const NON_BRANCH = /^(장점|단점|시점|관점|초점|약점|강점|정점|요점|중점|종점|만점|채점|별점|평점|빵점|백점|영점|매점|거점|기점|이점|반점|중간점|문제점|차이점|공통점|장단점|단골점|식당점|간점|걸점|음식점|전문점|정기점|가맹점|직영점|대리점|편의점|무인점|할인점|판매점|취약점|허점|접점|교점|꼭짓점|꼭지점|시발점|출발점|도달점|분기점|기준점|소수점|득점|실점|승점|벌점|가점|감점|배점|기본점|가산점)$/;
  // 접미사가 일반 업태인 '○○점'(지점 아님): 롯데백화점·교보문고서점·동네커피전문점… (규칙갭 탐지기가 발굴)
  const GENERIC_BRANCH_SUFFIX = /(백화점|면세점|서점|문고점|전문점|체인점|할인점|편의점|음식점|분식점|노점|상점|약국점|마트점)$/;
  // '○○점'이 지점명이 아닌 일반어인가? (하드코딩 + 접미사 + 학습된 사전)
  const isNonBranchWord = (full: string) => NON_BRANCH.test(full) || GENERIC_BRANCH_SUFFIX.test(full) || getLearned("nonbranch").has(full);
  // 🔀 [모든 카페] 같은 이름 '다른 지점(△△점)' 명시 감지 — 카페 이름이 '○○점'이 아니어도 적용.
  //   리뷰에 '△△점'(다른 지점)이 박혀 있고, 이 카페의 '동(洞)'이 리뷰 어디에도 없으면 = 다른 지점 후기 → 배제.
  //   ⚠️ '市'가 아니라 '洞' 기준: '분당점'은 성남시라서 市로 보면 통과돼버림 → 금광동(이 카페 동)이 없으면 다른 지점.
  //   정보(지점명·지역)가 본문에 다 적혀 있으니 LLM 없이 규칙으로 거른다.
  {
    const fullT = `${title} ${body}`;
    const dongTerm = areaTerms.find((a) => /(동|읍|면|가|리)$/.test(a));
    const dongCore = dongTerm ? dongTerm.replace(/(동|읍|면|가|리)$/, "") : "";
    // ⚠️ [룰갭19] 카페명=동네이름(예: "원곡")이면 dongCore도 "원곡"이 돼, 카페명이 텍스트에
    //   있기만 해도(이 체크 자체가 nameInTitle/nameInBody 전제) dongHere가 항상 참이 돼 무력화된다.
    //   이 경우엔 실제 카페 맥락어(CAFE_CONTEXT)까지 있어야 '이 동네(카페) 신호'로 인정한다.
    const nameEqualsDong = dongCore.length >= 2 && nameN === norm(dongCore);
    let dongHere = dongTerm ? (fullT.includes(dongTerm) || (dongCore.length >= 2 && fullT.includes(dongCore))) : areaPresent;
    if (nameEqualsDong) dongHere = dongHere && CAFE_CONTEXT.test(fullL);
    const otherBranch = (fullT.match(/([가-힣]{2,})점/g) ?? [])
      .map((t) => t.replace(/점$/, ""))
      .find((nm) => nm.length >= 2 && nm !== "본" && !isNonBranchWord(nm + "점")
        && !input.name.includes(nm)
        && !areaTerms.some((a) => a.includes(nm) || nm.includes(guShort(a))));
    if (otherBranch && !dongHere && (nameInTitle || nameInBody)) {
      return { verdict: "rejected", score: 6, reasons: [`다른 지점 후기('${otherBranch}점' 명시, 이 동네 '${dongTerm ?? areaTerms[0] ?? ""}' 신호 없음)`], signals: sig };
    }
  }
  // 지점(브랜치) 구분: 이 카페가 '○○점'이면, 후기가 '이 지점(지점명·지역)'을 가리켜야 인정.
  //   다른 지점명(예: '마곡점')이 박혀 있고 이 지점 신호가 없으면 다른 지점 후기 → 배제.
  const myBranch = input.name.match(/([가-힣A-Za-z0-9]{2,})점\s*$/)?.[1];
  if (myBranch) {
    const fullT = `${title} ${body}`;
    // [룰갭23·27] 지점접미사(도로명·쇼핑몰명·랜드마크명 등)는 그 자리를 공유하는 위치어일 뿐 지점 식별력이 없다
    //   (도로명: 카페인24 인천은하수로점 ← 같은 도로 다른 건물 '5PM sunset hour' 오염 / 몰명: 올드페리도넛
    //   광교갤러리아점 ← areaPresent(시 단위 '수원')만으로 형제 지점 '수원오목천점' 원문에 오귀속, id10902 실측).
    //   지점명 자체가 본문에 없다면, 브랜드 고유 토큰(myBranch 제외 나머지)이 대상 지역어와 '함께' 있어야만
    //   이 지점 신호로 인정한다 — 지역 단독으로는 불인정(도로명 여부와 무관하게 통일).
    const brandToken = tokens.find((tk) => tk !== myBranch);
    const myBranchHere = myBranch !== "본" && norm(fullT).includes(norm(myBranch)); // '이 지점' 랜드마크 직접 언급(공백무시)
    const branchSignal = myBranchHere
      || (!!brandToken && nameHit(fullT, norm(fullT), brandToken) && areaPresent);
    // ⚠️ [coord#126 P2] guShort 배제를 '시(市)명 자체'로 한정 — nm.includes(guShort)면 같은 市 다른 洞
    //   지점('포천일동' ← '포천시청점')이 감지에서 빠졌다(id14277: 참고셋 6/6이 형제 지점 '포천일동점').
    const otherBranchTok = (fullT.match(/([가-힣]{2,})점/g) ?? [])
      .map((t) => t.replace(/점$/, ""))
      // 공백무시(norm) 양방향 비교: 우리 이름이 nm을 포함('은평 본점'⊇'은평본')하거나, nm이 우리 지점
      //   랜드마크(myBranch)를 포함('이천날쌘카페하이닉스'⊇'하이닉스', '수원시청역'⊇'수원시청')하면 = 같은 지점의
      //   축약·장황·도시접두 표기일 뿐 다른 지점 아님. (도시명 접두·역명 변형이 형제로 오판되던 것 차단)
      .find((nm) => nm.length >= 2 && nm !== myBranch && nm !== "본" && !isNonBranchWord(nm + "점")
        && !norm(input.name).includes(norm(nm)) && !norm(nm).includes(norm(myBranch))
        && !areaTerms.some((a) => a.includes(nm) || norm(nm) === norm(guShort(a))));
    // 다른 지점명이 '명시'됐는데 '이 지점' 랜드마크(myBranch)가 본문에 없으면 = 형제 지점 후기 → 배제.
    //   (브랜드+市 신호는 형제 지점도 공유하므로 branchSignal만으로는 못 거른다 — 지점 랜드마크 필수화.)
    if (otherBranchTok && !myBranchHere) {
      return { verdict: "rejected", score: 6, reasons: [`다른 지점 후기('${otherBranchTok}점', 이 지점 '${myBranch}' 신호 없음)`], signals: sig };
    }
    // 브랜드만 일치하고 '이 지점' 신호가 전혀 없음 → verified 불가, 경계(LLM이 지점 확인)
    if (!branchSignal && (visit || substance >= 1)) {
      return { verdict: "rejected", score: 20, reasons: ["지점 불명확(브랜드만 일치) — LLM이 지점 확인"], borderline: true, signals: sig };
    }
  }
  // 🍲 같은 상호 '다른 음식점' 분리: 카페명 바로 뒤에 식당 메인메뉴어가 붙으면('장꼬방'→'장꼬방묵은김치찌개전문')
  //   = 같은 이름 다른 음식점 후기 → 배제. 빙수·디저트 후기는 살리고 찌개·백반만 거른다.
  //   (카페 자신이 그 메뉴명을 가진 경우는 제외 — '○○김치찌개'라는 카페명이면 적용 안 함)
  if ((nameInTitle || nameInBody) && nameN.length >= 2 && !RESTAURANT_MAIN.test(nameN)) {
    const fullT = `${title} ${body}`;
    const esc = nameN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // ① 이름±식당메뉴 인접(따옴표·공백 등 비한글 구분 허용, 양방향): '장꼬방묵은김치찌개'·"'장꼬방' 김치찌개"
    const adj = new RegExp(esc + "[^가-힣]{0,4}" + RESTAURANT_MAIN_SRC + "|" + RESTAURANT_MAIN_SRC + "[^가-힣]{0,4}" + esc);
    // ② 카페명이 있고 식당메뉴가 있는데 카페·디저트어가 하나도 없음 = 순수 식당 후기('김치찌개 맛집 장꼬방')
    const CAFE_FOOD = /(빙수|디저트|커피|케이크|케익|베이커리|빵|음료|라떼|브런치|아메리카노|에스프레소|찹쌀떡|마카롱|스콘|와플|쿠키|티라미수|푸딩|크로플|에이드|스무디|찻집|로스팅|원두|드립|초콜릿|아이스크림|젤라또)/;
    if (adj.test(norm(fullT)) || (RESTAURANT_MAIN.test(fullT) && !CAFE_FOOD.test(fullT))) {
      return { verdict: "rejected", score: 5, reasons: ["같은 상호 다른 음식점 후기(식당메뉴 위주, 카페 맥락 없음)"], signals: sig };
    }
  }
  // 📍 주소 검증(구조적 해법): 리뷰가 '풀주소(시·군·구 + 도로명+번지)'를 명시하는데, 그 구와 도로명이
  //   카페 등록주소와 '둘 다' 다르고 카페 주소도 본문에 없으면 = 같은 이름 다른 위치 업체 후기 → 배제.
  //   ⚠️ 구만/도로만 다른 건 인접구·근처도로 오탐(9%)이라 제외. '둘 다 다를 때만' = 1% 고정밀(측정 검증).
  if (input.addr) {
    const guOf = (s: string) => [...new Set(s.match(/[가-힣]{2,4}(시|군|구)/g) ?? [])];
    const roadOf = (s: string) => (s.match(/[가-힣A-Za-z0-9]{2,}(?:대로|로|길)/g) ?? []).map((r) => r.replace(/\s*\d+(번?길)?$/, "").replace(/\d+$/, "")).filter((r) => r.length >= 2);
    const cGu = guOf(input.addr), cRoad = roadOf(input.addr);
    const fullT = `${title} ${body}`;
    if (cGu.length && cRoad.length && /[가-힣]{2,4}(시|군|구)\s*[가-힣]{0,5}\s*[가-힣A-Za-z0-9]{2,}(대로|로|길)\s*\d/.test(fullT)) {
      const rGu = guOf(fullT), rRoad = roadOf(fullT);
      const guDiff = rGu.length > 0 && !rGu.some((g) => cGu.includes(g));
      const roadDiff = rRoad.length > 0 && !rRoad.some((rr) => cRoad.some((cc) => cc.includes(rr) || rr.includes(cc)));
      if (guDiff && roadDiff) {
        return { verdict: "rejected", score: 5, reasons: ["다른 위치 업체 후기(리뷰 주소가 등록 구·도로명과 모두 불일치)"], signals: sig };
      }
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
  // [룰갭 제안7] 위 inTitleFull 게이트(제안1·#156)는 '제목=카페명' 신뢰경로에만 CAFE_CONTEXT를 요구해,
  //   제목엔 이름이 없고(nameInTitle=false) 본문에만 짧은/흔한 이름이 스쳐 참고등급(reference)에 도달하는
  //   경로는 카페맥락 검증 없이 통과했다. id10592 '타다미'(일본어 다다미 동음이의)에서 펜션·건축사·맛집
  //   블로그 3건이 서로 다른 출처로 반복 확인. 제안1과 대칭 적용: 이름 4자 이하 또는 WEAK_IDENTITY_TOKEN급인데
  //   본문에만 등장하면 CAFE_CONTEXT 매칭을 최소 1개 요구(이름 3자 이하는 제안1과 동일하게 STRONG) —
  //   없으면 하드 탈락 대신 borderline(LLM 재판정)으로 격하해 표현 달라 안 걸린 진짜 카페 후기를 보호.
  if (!nameInTitle && nameInBody && ((nameNoSpace.length >= 1 && nameNoSpace.length <= 4) || weakWhitelist)) {
    const bodyCtxGate = nameNoSpace.length <= 3 ? CAFE_CONTEXT_STRONG : CAFE_CONTEXT;
    if (!bodyCtxGate.test(fullL)) {
      return { verdict: "rejected", score: 20, reasons: ["본문에만 짧은·흔한 카페명 등장하나 카페 맥락 전무(동음이의·타업종 혼입 의심) — LLM 재판정"], borderline: true, signals: sig };
    }
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
