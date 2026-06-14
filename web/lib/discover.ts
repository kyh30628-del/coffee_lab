// 카페 발굴 (PRINCIPLES §0·§2): 합법 소스(네이버 지역검색)로 동네·스페셜티 카페 수집.
// 대규모 프랜차이즈·비(非)카페 제외. 중복(이름/좌표 근사) 제외. 비공개로 적재 후 합성 단계에서 검증.
import { sql } from "./db";

const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;

// 대규모 저가 프랜차이즈 제외(스페셜티 체인은 유지)
const FRANCHISE = ["스타벅스", "투썸", "이디야", "메가커피", "메가엠지씨", "메가MGC", "메가mgc", "빽다방", "컴포즈", "커피빈", "할리스", "엔제리너스", "파스쿠찌", "탐앤탐스", "폴바셋", "드롭탑", "요거프레소", "더벤티", "매머드", "공차", "스무디킹", "스벅", "투썸플레이스", "카페베네", "페이바", "감성커피", "더카페", "코너스톤", "하삼동", "매가", "벤티", "고나우", "만랩", "토프레소", "셀렉토", "더리터", "달콤커피", "커피스미스", "주커피", "백억커피", "쥬씨", "더치앤빈", "빈스빈스", "커피명가", "커피에반하다", "카페보니또", "더착한커피", "감탄커피",
  // 베이커리·도넛·아이스크림 대기업 프랜차이즈(원칙: 프랜차이즈 제외)
  "던킨", "파리바게뜨", "파리바게트", "뚜레쥬르", "뚜레주르", "베스킨라빈스", "배스킨라빈스", "베스킨라", "배스킨라", "크리스피크림", "설빙", "나뚜루", "커피베이", "디저트39"];
// 이름에 들어있으면(지점이어도) 비카페인 '음식·소매' 키워드
const NON_CAFE = ["고로케", "정육", "세탁소", "치킨집", "피자", "분식", "국밥", "삼겹", "횟집", "노래방", "PC방", "문구"];
// 이름이 이 시설명으로 '끝'나면(지점 ○○점 제외) 카페가 아닌 시설 자체
const NON_CAFE_END = /(교회|성당|사찰|법당|학교|유치원|어린이집|병원|의원|한의원|치과|약국|도서관|주민센터|행정복지센터|우체국|경찰서|소방서|구청|시청)$/;
// 카페류 신호(이름·카테고리에 있으면 무조건 통과 — 북카페·○○병원점 같은 정상 카페 보호)
const CAFE_HINT = /(카페|까페|커피|coffee|로스터|베이커리|제과|제빵|디저트|브런치|에스프레소|라떼|티하우스|찻집|도넛|음료|아이스크림|와플|케이크|빙수|스무디|쥬스|gelato|젤라또|tea)/i;
// '카페' 글자가 있어도 커피 카페가 아닌 업종(키즈카페·스터디카페·만화카페·실내놀이터…) — CAFE_HINT보다 우선.
const NON_CAFE_OVERRIDE = /(키즈카페|실내놀이터|놀이방|스터디카페|스터디룸|독서실|만화카페|룸카페|멀티방|파티룸|방탈출|트램폴린|트램펄린|보드게임|볼링장|당구장|스크린골프|골프연습|pc방|피씨방|찜질방|사우나|클라이밍|코인노래|노래방|애견카페|고양이카페|동물카페|키즈)/i;

export const DISCOVER_KEYWORDS = [
  // 스페셜티·로스팅
  "로스터리", "스페셜티커피", "직접로스팅", "핸드드립", "싱글오리진", "자가배전", "드립커피전문점", "에스프레소바", "로스터스", "빈투바", "원두판매", "커피맛집",
  // 일반·동네
  "카페", "커피전문점", "동네카페", "작은카페", "신상카페", "대형카페", "카페추천", "예쁜카페", "분위기카페", "조용한카페",
  // 분위기·컨셉
  "감성카페", "빈티지카페", "루프탑카페", "테라스카페", "정원카페", "한옥카페", "갤러리카페", "북카페", "데이트카페", "통유리카페",
  // 디저트·베이커리
  "디저트카페", "베이커리카페", "브런치카페", "케이크카페", "수제디저트", "디저트맛집", "마카롱", "크로플", "도넛카페", "와플카페", "젤라또", "티룸", "빵맛집", "스콘맛집",
  // 메뉴·기타
  "라떼맛집", "아메리카노맛집", "비건카페", "밀크티전문점", "차전문점",
];

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

// 동(洞) 단위 정밀 발굴용 — 구 검색('강동구 카페')은 인기 상위 5곳(프랜차이즈·기수집)만 나와 롱테일 독립카페를 놓침.
// '강동구 상일동 로스터리'처럼 동+키워드로 좁히면 동네 독립카페가 잡힌다. 서울 25개 구 전체.
const SEOUL_DONGS: Record<string, string[]> = {
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
};
// 동 발굴용 핵심 키워드(독립·스페셜티 위주 — 프랜차이즈가 상위를 점령하지 않는 검색어)
const DONG_KEYWORDS = ["카페", "로스터리", "스페셜티커피", "핸드드립", "직접로스팅", "디저트카페", "베이커리카페", "감성카페", "브런치카페"];

const stripTags = (s: string) => (s || "").replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").trim();
export const isFranchise = (name: string) => { const n = name.replace(/\s/g, ""); return FRANCHISE.some((f) => n.includes(f)); };
export const isNonCafe = (name: string, category: string) => {
  const n = (name || "").replace(/\s/g, ""), cat = category || "";
  if (NON_CAFE_OVERRIDE.test(n) || NON_CAFE_OVERRIDE.test(cat)) return true; // '카페' 글자 있어도 비커피(키즈·스터디·만화·실내놀이터…)
  if (CAFE_HINT.test(n) || CAFE_HINT.test(cat)) return false;       // 카페류(이름/카테고리) → 통과(○○병원점·북카페·노티드 보호)
  // 네이버 카테고리가 있는데 카페류가 아니면 비카페(식당·방앗간·공방·서점·장소대여…) — 가장 정확한 신호
  if (cat) return true;
  // 카테고리 불명일 때만 이름 기반 보조 판단
  if (NON_CAFE.some((k) => n.includes(k))) return true;             // 음식/소매 키워드(고로케·정육…)
  if (!/점$/.test(n) && NON_CAFE_END.test(n)) return true;          // 시설명으로 끝 & 지점 아님(열방교회·○○도서관)
  return false;
};

async function localSearch(query: string) {
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5&sort=comment`;
  const res = await fetch(url, { headers: { "X-Naver-Client-Id": ID!, "X-Naver-Client-Secret": SECRET! } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? []).map((it: any) => ({
    name: stripTags(it.title),
    address: it.roadAddress || it.address || "",
    category: it.category || "",
    lng: it.mapx ? Number(it.mapx) / 1e7 : null,
    lat: it.mapy ? Number(it.mapy) / 1e7 : null,
  }));
}

// 한 지역 발굴: region=검색용(예 '서울 강동구'), areaLabel=저장용(예 '강동구')
export async function discoverRegion(region: string, areaLabel: string, keywords: string[] = DISCOVER_KEYWORDS) {
  if (!ID || !SECRET) throw new Error("네이버 키 미설정");
  const storeArea = areaLabel || region;
  const seen = new Set<string>();
  const found: any[] = [];
  const collect = async (query: string) => {
    const items = await localSearch(query);
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

  // ① 동(洞) 단위 정밀 발굴 — 동네 독립카페 롱테일(구 단위는 인기 상위 5곳만 나옴). 서울만 동 목록 보유.
  const gu = region.split(" ").pop() ?? region;
  const dongs = SEOUL_DONGS[gu] ?? [];
  for (const dong of dongs) for (const kw of DONG_KEYWORDS) await collect(`${gu} ${dong} ${kw}`);

  // ② 구 단위 광역 발굴 — 동 목록이 없는 경기·인천, 그리고 서울 보완.
  for (const kw of keywords) await collect(`${region} ${kw}`);

  let inserted = 0, skipped = 0;
  for (const it of found) {
    const exists = await sql`SELECT id FROM cafes WHERE name = ${it.name} OR (ABS(lat - ${it.lat}) < 0.0005 AND ABS(lng - ${it.lng}) < 0.0005) LIMIT 1`;
    if (exists.length > 0) { skipped++; continue; }
    const pseudoId = `nl_${it.name.replace(/\s/g, "")}_${Math.round(it.lat * 1e5)}`;
    // 신규 카페는 pipeline_status='new'로 태어남 → 풀 게이트(합성·AI판정·임베딩·검증) 통과 후에만 공개.
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS pipeline_status TEXT`.catch(() => {});
    await sql`
      INSERT INTO cafes (place_id, name, area, address, lat, lng, source, published, roasts_own, pipeline_status)
      VALUES (${pseudoId}, ${it.name}, ${storeArea}, ${it.address}, ${it.lat}, ${it.lng}, 'discover', false, false, 'new')
      ON CONFLICT (place_id) DO NOTHING`;
    inserted++;
  }
  return { region, found: found.length, inserted, skipped, names: found.map((f) => f.name) };
}
