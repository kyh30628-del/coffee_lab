// 카페 발굴 (PRINCIPLES §0·§2): 합법 소스(네이버 지역검색)로 동네·스페셜티 카페 수집.
// 대규모 프랜차이즈·비(非)카페 제외. 중복(이름/좌표 근사) 제외. 비공개로 적재 후 합성 단계에서 검증.
import { sql } from "./db";
import { getLearned } from "./learnedTerms";
import { loadCriteria, getCriterionSync } from "./criteria";

const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;

// 대규모 저가 프랜차이즈 제외(스페셜티 체인은 유지)
const FRANCHISE = ["스타벅스", "투썸", "이디야", "메가커피", "메가엠지씨", "메가MGC", "메가mgc", "빽다방", "컴포즈", "바나프레소", "우지커피", "커피빈", "할리스", "엔제리너스", "파스쿠찌", "탐앤탐스", "폴바셋", "드롭탑", "요거프레소", "더벤티", "매머드", "공차", "스무디킹", "스벅", "투썸플레이스", "카페베네", "페이바", "감성커피", "더카페", "코너스톤", "하삼동", "매가", "벤티", "고나우", "만랩", "토프레소", "셀렉토", "더리터", "달콤커피", "커피스미스", "주커피", "백억커피", "쥬씨", "더치앤빈", "빈스빈스", "커피명가", "커피에반하다", "카페보니또", "더착한커피", "감탄커피",
  // 베이커리·도넛·아이스크림 대기업 프랜차이즈(원칙: 프랜차이즈 제외)
  "던킨", "파리바게뜨", "파리바게트", "뚜레쥬르", "뚜레주르", "베스킨라빈스", "배스킨라빈스", "베스킨라", "배스킨라", "크리스피크림", "설빙", "나뚜루", "커피베이", "디저트39",
  // 추가 누락분(베이커리·카페·디저트 대기업 프랜차이즈)
  "아티제", "카페마마스", "빈스앤베리즈", "그라찌에", "브레댄코", "띠아모", "콜드스톤", "하겐다즈", "커피니", "신라명과",
  // 와플·간식·디저트 단품 프랜차이즈(커피 카페 아님 — 정체성 보호 위해 엄격 제외)
  "와플대학", "와플칸", "와플뱅크", "와플바인", "명랑핫도그", "고래사어묵", "스무디킹",
  // 차·초콜릿 프랜차이즈/체인(독립 찻집·베이글·초콜릿 디저트카페는 허용목록에서 통과시킴)
  "팔공티", "오가다", "고디바", "김보람초콜릿",
  // 누락 보강분(저가·디저트·베이커리 다지점 체인 — 스페셜티 로스터리는 유지)
  "텐퍼센트커피", "봉명동내커피", "읍천리382", "브런치빈", "나인블럭", "카페인중독", "카페봄봄", "커피인류", "포트캔커피", "프랭크커핀바", "하이테이블", "카페동네",
  "파리크라상", "롤링핀", "안스베이커리", "핫브레드", "좋은아침페스츄리", "노티드", "온더브레드", "홍종흔베이커리", "주재근베이커리", "삼송빵집", "화이트리에", "백금당", "명장시대"];
// 이름에 들어있으면(지점이어도) 비카페인 '음식·소매' 키워드
const NON_CAFE = ["고로케", "정육", "세탁소", "치킨집", "피자", "분식", "국밥", "삼겹", "횟집", "노래방", "PC방", "문구"];
// 이름이 이 시설명으로 '끝'나면(지점 ○○점 제외) 카페가 아닌 시설 자체
const NON_CAFE_END = /(교회|성당|사찰|법당|학교|유치원|어린이집|병원|의원|한의원|치과|약국|도서관|주민센터|행정복지센터|우체국|경찰서|소방서|구청|시청)$/;
// 카페류 신호(이름·카테고리에 있으면 무조건 통과 — 북카페·○○병원점 같은 정상 카페 보호)
const CAFE_HINT = /(카페|까페|커피|coffee|로스터|베이커리|제과|제빵|디저트|에스프레소|라떼|티하우스|찻집|도넛|음료|아이스크림|와플|케이크|빙수|스무디|쥬스|gelato|젤라또|tea)/i;
// 🍢 노점 간식(꽈배기·찹쌀도너츠·붕어빵 등) — 네이버가 '카페,디저트'로 오분류해도 커피 큐레이션 본질에 안 맞아 제외. CEO 지목 2026-07-04.
//   ⚠️ '도넛/도너츠' 단독은 막지 않음(런던베이글뮤지엄·랜디스도넛 등 트렌디 디저트 카페 유지). '찹쌀도너츠'만 노점.
//   이름에 카페 지표(CAFE_HINT) 있으면 예외 — '에스프레소바'의 '소바' 같은 오탐·'○○꽈배기카페' 보호.
const SNACK_STALL = /(꽈배기|찹쌀도너츠|찹쌀도넛|붕어빵|잉어빵|호떡|국화빵|계란빵|델리만쥬|호두과자|풀빵|옥수수빵|타코야키|핫도그|콘도그|떡볶이|김밥|순대|어묵|오뎅|튀김)/;
export const SNACK_STALL_SQL = "꽈배기|찹쌀 ?도너츠|찹쌀 ?도넛|붕어빵|잉어빵|호떡|국화빵|계란빵|델리만쥬|호두과자|풀빵|옥수수빵|타코야키|핫도그|콘도그|떡볶이|김밥|순대|어묵|오뎅|튀김";
export const isSnackStall = (name: string) => { const n = (name || "").replace(/\s/g, ""); return SNACK_STALL.test(n) && !CAFE_HINT.test(n); };
// 🏚️ 유령 상호 — 이름이 '순수 구조물/층 서술어'뿐인 합성 항목(예: "2층 카페", "2층사무실", "지하카페").
//   네이버 일반검색어를 상호로 착각해 만든 nl_<일반명사> place_id에서 발생. 카테고리는 '카페,디저트'라 통과하므로 이름으로 차단.
//   ⚠️ 브랜드 토큰이 하나라도 붙으면 제외 안 함('2층라이브러리'·'이층카페 더 로프트'·'반지하40'·'계단집' 보호). CEO 지목 2026-07-04.
const STRUCT_PHANTOM = /^(지하[0-9]*|반지하|지상[0-9]*|옥상|[0-9]+층|[일이삼사오육칠팔구십]+층)(카페|커피|사무실|공간|점포?|매장)?$/;
export const isStructuralPhantom = (name: string) => STRUCT_PHANTOM.test((name || "").replace(/\s/g, ""));
// 🤖 무인 카페 — 바리스타 없이 자판기·셀프로 운영. '진짜 방문 검증 후기' 큐레이션 본질에 안 맞아 영구 제외. CEO 지목 2026-07-04.
//   ⚠️ '무인도'(섬)·'무인양품'·'무인등대' 등 무인 오탐은 예외.
const UNMANNED_FALSE = /무인도|무인양품|무인등대|무인지대|무인기/;
export const isUnmannedCafe = (name: string) => { const n = name || ""; return /무인/.test(n) && !UNMANNED_FALSE.test(n); };
// '카페' 글자가 있어도 커피 카페가 아닌 업종(키즈카페·스터디카페·만화카페·실내놀이터…) — CAFE_HINT보다 우선.
const NON_CAFE_OVERRIDE = /(키즈카페|실내놀이터|놀이방|스터디카페|스터디룸|독서실|만화카페|룸카페|멀티방|파티룸|방탈출|트램폴린|트램펄린|보드게임|볼링장|당구장|스크린골프|골프연습|pc방|피씨방|찜질방|사우나|클라이밍|코인노래|노래방|애견카페|고양이카페|동물카페|키즈)/i;

export const DISCOVER_KEYWORDS = [
  // 스페셜티·로스팅
  "로스터리", "스페셜티커피", "직접로스팅", "핸드드립", "싱글오리진", "자가배전", "드립커피전문점", "에스프레소바", "로스터스", "빈투바", "원두판매", "커피맛집",
  // 일반·동네
  "카페", "커피전문점", "동네카페", "작은카페", "신상카페", "대형카페", "카페추천", "예쁜카페", "분위기카페", "조용한카페",
  // 분위기·컨셉
  "감성카페", "빈티지카페", "루프탑카페", "테라스카페", "정원카페", "한옥카페", "갤러리카페", "데이트카페", "통유리카페",
  // 디저트·베이커리
  "디저트카페", "베이커리카페", "브런치카페", "케이크카페", "수제디저트", "디저트맛집", "마카롱", "크로플", "도넛카페", "와플카페", "젤라또", "티룸", "빵맛집", "스콘맛집",
  // 메뉴·기타
  "라떼맛집", "아메리카노맛집", "비건카페", "밀크티전문점", "차전문점",
];

// 🎯 우선 지역(사장님 지정) — 신규 합성·임베딩·공개·발굴에서 항상 먼저 처리.
//   cafes.area는 접두사 없음("송파구"), discovery_state.region은 접두사 있음("서울 송파구") → 두 형식 분리.
export const PRIORITY_AREAS = ["송파구", "강동구", "구리시"];
export const PRIORITY_REGIONS = ["서울 강동구", "서울 송파구", "경기 구리시"];

// 수도권 전 지역 (검색용 region, 저장용 areaLabel) — 에이전트가 순회 발굴
export const METRO_REGIONS: { region: string; areaLabel: string }[] = (() => {
  const R: Record<string, string[]> = {
    서울: ["강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구"],
    경기: ["수원시", "성남시", "고양시", "용인시", "부천시", "안산시", "안양시", "남양주시", "화성시", "평택시", "의정부시", "시흥시", "파주시", "김포시", "광명시", "광주시", "군포시", "하남시", "오산시", "양주시", "구리시", "안성시", "포천시", "의왕시", "여주시", "동두천시", "과천시", "이천시", "양평군", "가평군", "연천군"],
    인천: ["미추홀구", "연수구", "남동구", "부평구", "계양구", "서구", "강화군", "옹진군"],
  };
  const out: { region: string; areaLabel: string }[] = [];
  for (const [sido, gus] of Object.entries(R)) for (const gu of gus) out.push({ region: `${sido} ${gu}`, areaLabel: sido === "인천" ? `인천 ${gu}` : gu });
  return out;
})();

// 동(洞)·읍·면 단위 정밀 발굴용 — 구/시 검색('강동구 카페')은 인기 상위 5곳(프랜차이즈·기수집)만 나와 롱테일 독립카페를 놓침.
// '강동구 상일동 로스터리'처럼 좁히면 동네 독립카페가 잡힌다. 서울·경기·인천 전 지역.
const DONGS: Record<string, string[]> = {
  강남구: ["역삼동", "삼성동", "대치동", "논현동", "압구정동", "청담동", "신사동", "도곡동", "개포동", "일원동", "수서동", "세곡동"],
  강동구: ["강일동", "상일동", "명일동", "고덕동", "암사동", "천호동", "성내동", "길동", "둔촌동"],
  강북구: ["미아동", "수유동", "번동", "우이동"],
  강서구: ["화곡동", "등촌동", "가양동", "마곡동", "방화동", "공항동", "염창동", "발산동", "우장산동"],
  관악구: ["봉천동", "신림동", "남현동", "서울대입구", "샤로수길"],
  광진구: ["자양동", "구의동", "광장동", "화양동", "군자동", "중곡동", "건대입구"],
  구로구: ["구로동", "신도림동", "개봉동", "고척동", "오류동", "항동", "가리봉동"],
  금천구: ["가산동", "독산동", "시흥동"],
  노원구: ["상계동", "중계동", "하계동", "공릉동", "월계동"],
  도봉구: ["쌍문동", "방학동", "창동", "도봉동"],
  동대문구: ["전농동", "답십리동", "장안동", "청량리동", "회기동", "휘경동", "이문동", "제기동", "용두동"],
  동작구: ["노량진동", "상도동", "사당동", "대방동", "신대방동", "흑석동"],
  마포구: ["합정동", "서교동", "망원동", "연남동", "성산동", "상암동", "공덕동", "아현동", "대흥동", "염리동", "도화동", "연트럴파크"],
  서대문구: ["홍제동", "홍은동", "남가좌동", "북가좌동", "연희동", "신촌동", "대현동", "충정로"],
  서초구: ["서초동", "반포동", "잠원동", "방배동", "양재동", "내곡동"],
  성동구: ["성수동", "왕십리동", "행당동", "금호동", "옥수동", "응봉동", "마장동", "사근동", "송정동", "서울숲"],
  성북구: ["성북동", "동선동", "돈암동", "안암동", "보문동", "정릉동", "길음동", "종암동", "석관동", "장위동"],
  송파구: ["잠실동", "신천동", "풍납동", "송파동", "석촌동", "가락동", "문정동", "장지동", "방이동", "오금동", "거여동", "마천동"],
  양천구: ["목동", "신정동", "신월동"],
  영등포구: ["여의도동", "영등포동", "당산동", "양평동", "문래동", "신길동", "대림동", "도림동"],
  용산구: ["이태원동", "한남동", "후암동", "용산동", "청파동", "효창동", "원효로", "한강로", "보광동", "서빙고동", "경리단길", "해방촌"],
  은평구: ["응암동", "녹번동", "불광동", "갈현동", "구산동", "대조동", "역촌동", "증산동", "수색동", "진관동"],
  종로구: ["청운동", "사직동", "삼청동", "가회동", "혜화동", "명륜동", "인사동", "평창동", "부암동", "익선동", "효자동", "서촌"],
  중구: ["명동", "충무로", "을지로", "신당동", "황학동", "회현동", "정동", "약수동", "다산동"],
  중랑구: ["면목동", "상봉동", "중화동", "묵동", "망우동", "신내동"],
  // 경기 31개 시·군 (구 보유시는 구도 포함). 카페 밀집 동/읍/면·생활권 위주.
  수원시: ["인계동", "행궁동", "광교", "영통동", "매탄동", "정자동", "화서동", "권선동", "세류동", "조원동", "우만동", "장안구", "팔달구"],
  성남시: ["분당", "정자동", "서현동", "수내동", "판교", "야탑동", "위례", "태평동", "신흥동", "상대원동", "수정구", "중원구"],
  고양시: ["일산", "정발산동", "주엽동", "장항동", "마두동", "화정동", "행신동", "원당", "백석동", "대화동", "탄현동", "삼송", "원흥"],
  용인시: ["수지", "죽전동", "신봉동", "동백", "기흥", "보정동", "구성", "상현동", "풍덕천동", "처인구", "김량장동"],
  부천시: ["중동", "상동", "원미동", "송내동", "역곡", "심곡동", "소사", "부천역", "춘의동"],
  안산시: ["고잔동", "중앙동", "상록수", "본오동", "사동", "선부동", "원곡동", "초지동", "대부도"],
  안양시: ["평촌", "범계", "안양일번가", "비산동", "호계동", "관양동", "인덕원", "박달동"],
  남양주시: ["다산동", "별내", "평내동", "호평동", "화도읍", "진접읍", "오남읍", "와부읍", "덕소"],
  화성시: ["동탄", "병점동", "향남읍", "봉담읍", "남양", "기배동", "반월동", "새솔동"],
  평택시: ["평택동", "비전동", "송탄", "서정동", "안중읍", "포승읍", "청북읍", "고덕", "지제동"],
  의정부시: ["의정부동", "민락동", "호원동", "가능동", "녹양동", "신곡동", "장암동"],
  시흥시: ["정왕동", "배곧", "월곶동", "은행동", "대야동", "신천동", "목감동", "능곡동", "연성동"],
  파주시: ["운정", "금촌동", "교하동", "문산읍", "법원읍", "조리읍", "탄현면", "헤이리", "파주출판도시"],
  김포시: ["사우동", "장기동", "구래동", "운양동", "풍무동", "고촌읍", "통진읍", "마산동", "걸포동"],
  광명시: ["철산동", "하안동", "소하동", "광명동", "일직동", "노온사동"],
  광주시: ["경안동", "송정동", "태전동", "오포읍", "초월읍", "곤지암읍", "퇴촌면", "남종면"],
  군포시: ["산본동", "금정동", "당동", "대야미동", "부곡동"],
  하남시: ["미사", "신장동", "덕풍동", "풍산동", "감일", "위례", "춘궁동"],
  오산시: ["오산동", "원동", "궐동", "세교동", "갈곶동", "부산동", "세마동"],
  양주시: ["덕정동", "옥정", "회천", "양주동", "백석읍", "광적면", "장흥면"],
  구리시: ["인창동", "교문동", "수택동", "갈매동", "토평동"],
  안성시: ["봉산동", "공도읍", "대덕면", "미양면", "원곡면", "죽산면"],
  포천시: ["소흘읍", "포천동", "송우리", "영북면", "이동면", "일동면", "화현면"],
  의왕시: ["내손동", "오전동", "고천동", "청계동", "포일동", "백운호수"],
  여주시: ["여주동", "가남읍", "점동면", "능서면", "흥천면", "오학동"],
  동두천시: ["생연동", "불현동", "상패동", "소요동", "송내동"],
  과천시: ["별양동", "중앙동", "갈현동", "문원동", "과천동"],
  이천시: ["관고동", "중리동", "증포동", "부발읍", "장호원읍", "마장면", "호법면"],
  양평군: ["양평읍", "용문면", "옥천면", "서종면", "강하면", "양서면", "두물머리"],
  가평군: ["가평읍", "청평면", "상면", "조종면", "북면", "설악면"],
  연천군: ["전곡읍", "연천읍", "청산면", "백학면", "미산면"],
  // 인천 8개 구·군
  미추홀구: ["주안동", "용현동", "숭의동", "학익동", "관교동", "문학동", "도화동"],
  연수구: ["송도", "연수동", "청학동", "동춘동", "옥련동", "선학동"],
  남동구: ["구월동", "논현동", "간석동", "만수동", "서창동", "장수동", "남촌동", "소래포구"],
  부평구: ["부평동", "산곡동", "청천동", "갈산동", "삼산동", "십정동", "부개동", "일신동"],
  계양구: ["계산동", "작전동", "효성동", "임학동", "병방동", "서운동"],
  서구: ["청라", "검단", "가정동", "석남동", "연희동", "원당동", "당하동", "불로동", "루원시티"],
  강화군: ["강화읍", "길상면", "화도면", "불은면", "선원면", "교동면"],
  옹진군: ["북도면", "백령면", "연평면", "덕적면", "영흥면", "자월면"],
};
// 동 발굴용 핵심 키워드(독립·스페셜티 위주 — 프랜차이즈가 상위를 점령하지 않는 검색어)
// 네이버 지역검색은 키워드당 인기 상위 5개만 반환(페이징 없음) → 키워드를 다양화할수록 서로 다른 상위5가 잡혀 롱테일 커버리지↑.
// (단, 인기 매우 낮은 신생·소형 카페는 어떤 키워드로도 상위5에 못 들어 누락 — 완전 해결은 data.go.kr 상가업소 API(lib/sangga.ts).)
// 일반 키워드("카페"·"디저트")는 프랜차이즈가 리뷰수로 상위5를 점령 → 동네 카페 0곳.
// 메뉴·특화 키워드는 프랜차이즈 벽을 우회해 '리뷰 많은 동네 카페'를 상위로 끌어올림(누락의 핵심 해소).
const DONG_KEYWORDS = ["카페", "로스터리", "스페셜티커피", "핸드드립", "직접로스팅", "디저트카페", "베이커리카페", "감성카페", "브런치카페",
  "커피", "빵집", "케이크", "에스프레소바", "원두", "라떼맛집", "동네카페", "신상카페", "조용한카페", "카페거리", "테이크아웃커피",
  // 메뉴·품목 특화(프랜차이즈 우회 — 동네 전문 카페 발굴력↑)
  "도넛", "베이글", "타르트", "마카롱", "스콘", "휘낭시에", "크로플", "카눌레", "젤라또", "푸딩", "티라미수", "약과", "쿠키", "빙수", "수제디저트", "디저트맛집", "빵맛집", "커피맛집"];

// 사장님이 직접 '비카페'로 지목한 곳 — 카테고리가 비어 규칙이 못 잡는 케이스를 이름으로 확실히 차단.
const MANUAL_NONCAFE = ["차덕분"];
const stripTags = (s: string) => (s || "").replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").trim();
// 지번주소에서 동/읍/면 추출 — '서울특별시 강동구 상일동 502' → '상일동', '경기도 수원시 장안구 정자동' → '정자동'.
// 구/시/군 뒤에 오는 동·읍·면·가 토큰. 행정동 숫자(여의도동·1가 등) 포함.
export function parseDong(jibun: string): string | null {
  if (!jibun) return null;
  // ★ 음수 룩어헤드(?![가-힣]) 필수: '서울특별시 강동구'에서 '시 강동'을 잡아 dong='강동'으로 만들던 버그 방지.
  //   동 뒤에 한글이 더 오면(강동'구', 강동'대로') 그건 동이 아니므로 거부 → 진짜 동(천호동 등)을 찾는다.
  const m = jibun.match(/(?:구|시|군)\s+([가-힣]+[0-9]?(?:동|읍|면|가))(?![가-힣])/);
  return m ? m[1] : null;
}
export const isFranchise = (name: string) => { const n = name.replace(/\s/g, ""); return FRANCHISE.some((f) => n.includes(f)) || [...getLearned("franchise")].some((f) => n.includes(f)); };

// 🚫 이름 자체가 '일반 음식·메뉴어'인 카페 → 이름으로 식별 불가(그 음식 리뷰가 전부 매칭돼 coherence=1.0 오인).
//   예: '베이글'·'아메리카노'·'빵' 카페는 빵·음료 리뷰를 긁어옴 → 공개 금지. (정확히 그 단어 하나일 때만)
const GENERIC_FOOD_NAMES = new Set([
  "베이글", "도넛", "도너츠", "케이크", "케익", "케잌", "빵", "빵집", "커피", "라떼", "스콘", "와플", "마카롱",
  "디저트", "베이커리", "브런치", "크로플", "휘낭시에", "휘낭", "티라미수", "푸딩", "쿠키", "타르트", "크림빵",
  "소금빵", "크루아상", "초콜릿", "쇼콜라", "젤라또", "아이스크림", "빙수", "마들렌", "에끌레어", "카눌레",
  "약과", "꽈배기", "츄러스", "버블티", "밀크티", "에스프레소", "아메리카노", "카푸치노", "녹차", "말차",
  "단팥빵", "식빵", "샌드위치", "피자", "떡", "한과", "차", "티", "원두", "로스팅", "스무디", "에이드",
]);
export const isGenericFoodName = (name: string) => { const n = (name || "").replace(/\s/g, ""); return GENERIC_FOOD_NAMES.has(n) || getLearned("generic").has(n); };
// 엄격 비카페 판정 — 정체성(진짜 커피 카페)을 지키기 위해 카테고리 '리프(끝)'로 판단.
// 핵심: 네이버는 '카페,디저트>와플'처럼 앞에 '카페'를 붙임 → 앞부분 매칭은 와플·아이스크림·음식점도 통과시킴(버그).
//       반드시 마지막 > 뒤(리프)로 봐야 와플대학·아이스크림·음식점을 제대로 거른다.
export const isNonCafe = (name: string, category: string) => {
  const n = (name || "").replace(/\s/g, ""), cat = category || "";
  if (MANUAL_NONCAFE.some((b) => n.includes(b.replace(/\s/g, "")))) return true; // 직접 지목 비카페(차덕분 등) — 카테고리 무관 확실 차단
  if (isSnackStall(name)) return true; // 🍢 노점 간식(꽈배기·찹쌀도너츠 등) — 네이버 '카페,디저트' 오분류 무시하고 차단
  if (isStructuralPhantom(name)) return true; // 🏚️ 유령 상호("2층 카페"·"2층사무실" 등) — 카테고리 카페여도 차단
  if (NON_CAFE_OVERRIDE.test(n) || NON_CAFE_OVERRIDE.test(cat)) return true; // 키즈·스터디·만화·실내놀이터 등
  if (/브런치/.test(n) || (cat && /브런치/.test(cat))) return true; // 🍳 브런치 전체 제외(식사 위주) — CEO 정책 2026-07-04. '동네 커피 노트'=커피 큐레이션. 카테고리·이름 어느 쪽이든 브런치면 차단('브런치카페'가 '카페' 포함해 통과하던 것 포함).
  if (cat) {
    // 카테고리 경로를 '구간(segment)'으로 본다. 네이버='카페,디저트>와플', 카카오='음식점 > 카페 > 커피전문점 > {브랜드}'
    //  처럼 형식이 다르므로, 리프만 보면 브랜드명이 끝일 때(읍천리382 등) 진짜 카페를 놓친다.
    const segs = cat.split(">").map((s) => s.trim()).filter(Boolean);
    const cafeKw = /(카페|커피|로스터|찻집|티하우스|차전문|디저트|베이커리|제과|브런치|도넛|케이크|타르트|마카롱|와플|아이스크림|빙수|젤라또|크레페|츄러스|티룸|밀크티|버블티|쿠키|푸딩|스무디|베이글|초콜릿|쇼콜라)/;
    const top = segs[0] || "", second = segs[1] || "", leaf = segs[segs.length - 1] || "";
    // (1) '음식점 > …': 2번째 구간이 카페·커피·브런치·베이커리·제과·디저트면 카페. 양식·한식·분식 등은 비카페.
    if (top === "음식점") return /(카페|커피|브런치|베이커리|제과|디저트|찻집|티룸)/.test(second) ? false : true;
    // (2) '카페,디저트 > …'(네이버 최상위): 리프가 카페·디저트류면 카페. 찐빵·떡 등 비-디저트 리프는 비카페.
    if (/^(카페|디저트)/.test(top)) return (cafeKw.test(leaf) || leaf === "차") ? false : true;
    // (3) 명백한 비카페 업종 최상위(제조·교육/학원·의료·쇼핑·서비스산업·문화예술 등) → 차단('차,커피 제조업' 오인 방지).
    if (/(제조|직업|기술교육|교육,학문|학원|의료|병원|약국|쇼핑|유통|자동차|부동산|서비스,산업|금융|문화,예술|숙박|스포츠|공공|종교)/.test(top)) return true;
    // (4) 그 외 단일/기타 카테고리: 카페 키워드(브런치카페·베이커리·디저트 등) 있으면 카페, 없으면 비카페.
    return cafeKw.test(cat) ? false : true;
  }
  // 카테고리 불명 → 이름 기반 보조
  if (CAFE_HINT.test(n)) return false;
  if (NON_CAFE.some((k) => n.includes(k))) return true;
  if (!/점$/.test(n) && NON_CAFE_END.test(n)) return true;
  return false;
};

async function localSearch(query: string, sort: "comment" | "random" = "comment") {
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5&sort=${sort}`;
  const res = await fetch(url, { headers: { "X-Naver-Client-Id": ID!, "X-Naver-Client-Secret": SECRET! } });
  if (!res.ok) return null; // 쿼터(429)·API 오류 → null로 신호(빈 결과 [] 와 구분: '못 가져옴' vs '진짜 없음')
  const data = await res.json();
  return (data.items ?? []).map((it: any) => ({
    name: stripTags(it.title),
    address: it.roadAddress || it.address || "",
    dong: parseDong(it.address || ""), // 지번에서 동/읍/면 추출(계층 필터·지도 집계용)
    category: stripTags(it.category || ""),
    lng: it.mapx ? Number(it.mapx) / 1e7 : null,
    lat: it.mapy ? Number(it.mapy) / 1e7 : null,
  }));
}

// 🔎 폐업 재확인: 카페가 네이버에 '아직 존재'하나? (닫힌 카페는 사라짐) — 권위적 신호.
//   true=존재(이름매칭+좌표근접), false=명백히 없음, null=API오류/쿼터(판단보류).
//   이전(확장이전)은 네이버에 있으므로 true → 유지(주소만 stale). 폐업은 검색에서 사라져 false.
export async function naverExists(name: string, area: string, lat: number | null, lng: number | null): Promise<boolean | null> {
  const items = await localSearch(`${area ?? ""} ${name}`.trim());
  if (items === null) return null; // 쿼터/오류 → 판단 보류
  const nm = (s: string) => (s || "").replace(/\s/g, "").toLowerCase();
  const nN = nm(name);
  return items.some((it: any) => {
    const iN = nm(it.name);
    const nameMatch = iN.length >= 2 && (iN.includes(nN) || nN.includes(iN));
    const near = lat != null && it.lat != null && Math.abs(it.lat - lat) < 0.004 && Math.abs(it.lng - lng!) < 0.004;
    return nameMatch && (near || lat == null);
  });
}

// 🔎 폐업 재확인(보수판) — 네이버 지역검색 API는 5개·인기순이라 흔한 이름은 진짜 있어도 상위5위 밖이면 누락.
//   그래서 '못 찾음'을 폐업으로 단정 못 함. 여러 쿼리(이름+구·이름+동·이름만)로 recall을 올려
//   하나라도 좌표 근처 매칭되면 '영업중 확정'(false 오탐 최소화). 그래도 false는 '의심'일 뿐 폐업확정 아님.
//   반환: true=존재(어느 쿼리든 매칭), false=모든 쿼리서 미발견, null=모든 쿼리가 쿼터/오류(판단보류).
export async function naverExistsRobust(name: string, area: string, dong: string, lat: number | null, lng: number | null): Promise<boolean | null> {
  const nm = (s: string) => (s || "").replace(/\s/g, "").toLowerCase();
  const nN = nm(name);
  const queries = [`${area ?? ""} ${name}`.trim(), dong ? `${dong} ${name}`.trim() : "", name.trim()]
    .filter((q, i, a) => q && a.indexOf(q) === i);
  let anyOk = false;
  for (const q of queries) {
    const items = await localSearch(q);
    if (items === null) { await new Promise((r) => setTimeout(r, 200)); continue; } // 이 쿼리만 쿼터 → 다음 쿼리 시도
    anyOk = true;
    const hit = items.some((it: any) => {
      const iN = nm(it.name);
      const nameMatch = iN.length >= 2 && (iN.includes(nN) || nN.includes(iN));
      const near = lat != null && it.lat != null && Math.abs(it.lat - lat) < 0.005 && Math.abs(it.lng - lng!) < 0.005;
      return nameMatch && (near || lat == null);
    });
    if (hit) return true; // 어느 쿼리든 찾으면 영업중 확정
    await new Promise((r) => setTimeout(r, 200));
  }
  return anyOk ? false : null; // 최소 한 쿼리라도 성공했는데 다 미발견 → false(의심). 전부 쿼터 → null(보류)
}

// 한 지역 발굴: region=검색용(예 '서울 강동구'), areaLabel=저장용(예 '강동구')
// 공격적 커버리지: sort=comment+random 2패스 + 동/도로 지리 세분화로 '검색 창'을 최대화 →
//   프랜차이즈에 묻힌 리뷰 많은 동네카페를 더 건진다(쿼리당 5캡은 못 넘으니 창 다각화가 유일한 길).
//   deadlineMs로 함수시간 내 안전 중단 + 작업 셔플 → 부분 실행이어도 매 회차 다른 영역을 커버.
export async function discoverRegion(region: string, areaLabel: string, keywords: string[] = DISCOVER_KEYWORDS, opts: { deadlineMs?: number; sorts?: ("comment" | "random")[] } = {}) {
  if (!ID || !SECRET) throw new Error("네이버 키 미설정");
  const sorts = opts.sorts ?? ["comment"];
  const deadline = opts.deadlineMs ?? Infinity;
  const storeArea = areaLabel || region;
  const seen = new Set<string>();
  const found: any[] = [];
  let stopped = false;
  let apiFails = 0; // 네이버 쿼터/API 실패 횟수 — found=0인데 이게 >0이면 '진짜 빈 지역'이 아니라 쿼터 소진
  const collect = async (query: string, sort: "comment" | "random") => {
    const items = await localSearch(query, sort);
    if (items === null) { apiFails++; await new Promise((r) => setTimeout(r, 220)); return; }
    for (const it of items) {
      if (!it.name || !it.lat || !it.lng) continue;
      if (isFranchise(it.name) || isNonCafe(it.name, it.category)) continue;
      const key = it.name.replace(/\s/g, "") + Math.round(it.lat * 1000);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(it);
    }
    await new Promise((r) => setTimeout(r, 220));
  };

  const gu = region.split(" ").pop() ?? region;
  const dongs = DONGS[gu] ?? [];

  // ── 검색 작업 풀: (지리단위 × 키워드 × sort). 셔플 후 deadline까지 처리.
  const tasks: { q: string; sort: "comment" | "random" }[] = [];
  for (const sort of sorts) {
    // ① 동(洞) 단위 정밀 발굴(서울만 동 목록 보유) ② 구 단위 광역(경기·인천 + 서울 보완)
    for (const dong of dongs) for (const kw of DONG_KEYWORDS) tasks.push({ q: `${gu} ${dong} ${kw}`, sort });
    for (const kw of keywords) tasks.push({ q: `${region} ${kw}`, sort });
  }
  // ③ 지리 세분화 — 이미 보유한 카페 주소에서 도로명 추출 → 도로 단위로 더 잘게(상위5 창 증가).
  try {
    const addrRows = (await sql`SELECT address FROM cafes WHERE area = ${storeArea} AND address IS NOT NULL`) as unknown as { address: string }[];
    const roadFreq = new Map<string, number>();
    for (const r of addrRows) {
      const m = (r.address || "").match(/([가-힣A-Za-z0-9]+(?:대로|로|길))\s*\d/);
      if (m) roadFreq.set(m[1], (roadFreq.get(m[1]) ?? 0) + 1);
    }
    const roads = [...roadFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([r]) => r);
    const CORE = ["카페", "로스터리", "디저트", "베이커리", "브런치", "도넛"];
    for (const sort of sorts) for (const road of roads) for (const kw of CORE) tasks.push({ q: `${road} ${kw}`, sort });
  } catch { /* 주소 없으면 도로 세분화 생략 */ }

  // 셔플(Fisher–Yates) — 부분 실행 시 특정 동·키워드에 편중되지 않게.
  for (let i = tasks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tasks[i], tasks[j]] = [tasks[j], tasks[i]]; }

  for (const t of tasks) {
    if (Date.now() > deadline) { stopped = true; break; }
    await collect(t.q, t.sort);
  }

  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS pipeline_status TEXT`.catch(() => {});
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS dong TEXT`.catch(() => {});
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS naver_category TEXT`.catch(() => {});
  await loadCriteria(); // 수도권 좌표박스 기준 캐시 갱신(폴백=36.8~38.3/124.5~127.9)
  const latMin = getCriterionSync("geo.box.lat_min"), latMax = getCriterionSync("geo.box.lat_max");
  const lngMin = getCriterionSync("geo.box.lng_min"), lngMax = getCriterionSync("geo.box.lng_max");
  let inserted = 0, skipped = 0, backfilled = 0, oob = 0;
  for (const it of found) {
    // 🗺️ 수도권 박스 밖(비수도권) 좌표는 신규 적재 안 함 — 네이버가 동명 타지역 업체(성심당 본점=대전,
    //   사운즈커피 만촌=대구)를 반환해도 서비스(수도권)와 무관하므로 제외. 공개 게이트도 막지만 적재 단계서 차단=DB 청결.
    if (it.lat != null && it.lng != null && !(it.lat >= latMin && it.lat <= latMax && it.lng >= lngMin && it.lng <= lngMax)) { oob++; continue; }
    const exists = await sql`SELECT id, dong, naver_category FROM cafes WHERE name = ${it.name} OR (ABS(lat - ${it.lat}) < 0.0005 AND ABS(lng - ${it.lng}) < 0.0005) LIMIT 1`;
    if (exists.length > 0) {
      // 기존 카페: 동·카테고리 정보가 없으면 발굴 중 백필(추가 호출 없이). 카테고리는 비카페 게이트 정확도에 중요.
      if (it.dong && !exists[0].dong) { await sql`UPDATE cafes SET dong = ${it.dong} WHERE id = ${exists[0].id}`; backfilled++; }
      if (it.category && !exists[0].naver_category) { await sql`UPDATE cafes SET naver_category = ${it.category} WHERE id = ${exists[0].id}`; }
      skipped++; continue;
    }
    const pseudoId = `nl_${it.name.replace(/\s/g, "")}_${Math.round(it.lat * 1e5)}`;
    // 신규 카페는 pipeline_status='new'로 태어남 → 풀 게이트(합성·AI판정·임베딩·검증) 통과 후에만 공개.
    await sql`
      INSERT INTO cafes (place_id, name, area, dong, naver_category, address, lat, lng, source, published, roasts_own, pipeline_status)
      VALUES (${pseudoId}, ${it.name}, ${storeArea}, ${it.dong}, ${it.category}, ${it.address}, ${it.lat}, ${it.lng}, 'discover', false, false, 'new')
      ON CONFLICT (place_id) DO NOTHING`;
    inserted++;
  }
  // apiError: 아무것도 못 건졌는데 API 실패가 있었음 = 쿼터 소진(진짜 빈 지역 아님) → 호출부가 last_run 안 굳히게.
  const apiError = found.length === 0 && apiFails > 0;
  return { region, found: found.length, inserted, skipped, backfilled, oob, stopped, apiError, apiFails, tasks: tasks.length, names: found.map((f) => f.name) };
}
