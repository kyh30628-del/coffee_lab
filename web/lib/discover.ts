// 카페 발굴 (PRINCIPLES §0·§2): 합법 소스(네이버 지역검색)로 동네·스페셜티 카페 수집.
// 대규모 프랜차이즈·비(非)카페 제외. 중복(이름/좌표 근사) 제외. 비공개로 적재 후 합성 단계에서 검증.
import { sql } from "./db";

const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;

// 대규모 저가 프랜차이즈 제외(스페셜티 체인은 유지)
const FRANCHISE = ["스타벅스", "투썸", "이디야", "메가커피", "메가엠지씨", "빽다방", "컴포즈", "커피빈", "할리스", "엔제리너스", "파스쿠찌", "탐앤탐스", "폴바셋", "드롭탑", "요거프레소", "더벤티", "매머드", "공차", "스무디킹", "스벅", "투썸플레이스", "카페베네", "페이바", "감성커피", "더카페", "코너스톤", "하삼동", "매가", "벤티", "고나우", "만랩", "토프레소", "셀렉토", "더리터", "달콤커피", "커피스미스", "주커피", "백억커피", "쥬씨", "더치앤빈", "빈스빈스", "커피명가", "커피에반하다", "카페보니또", "더착한커피", "감탄커피"];
const NON_CAFE = ["고로케", "정육", "마트", "편의점", "세탁", "미용", "약국", "치킨", "피자", "분식", "국밥", "삼겹", "횟집", "노래", "PC방", "문구", "부동산", "학원", "병원", "은행"];

export const DISCOVER_KEYWORDS = ["로스터리", "스페셜티커피", "직접로스팅", "핸드드립", "싱글오리진", "자가배전", "드립커피전문점", "에스프레소바", "커피 맛집", "동네카페", "작은카페", "감성카페", "디저트카페", "베이커리카페", "브런치카페", "분위기좋은카페", "조용한카페", "루프탑카페", "북카페", "빈티지카페"];

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

const stripTags = (s: string) => (s || "").replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").trim();
const isFranchise = (name: string) => { const n = name.replace(/\s/g, ""); return FRANCHISE.some((f) => n.includes(f)); };
const isNonCafe = (name: string, category: string) => { const blob = (name + category).replace(/\s/g, ""); return NON_CAFE.some((k) => blob.includes(k)); };

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
  for (const kw of keywords) {
    const items = await localSearch(`${region} ${kw}`);
    for (const it of items) {
      if (!it.name || !it.lat || !it.lng) continue;
      if (isFranchise(it.name) || isNonCafe(it.name, it.category)) continue;
      const key = it.name.replace(/\s/g, "") + Math.round(it.lat * 1000);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(it);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  let inserted = 0, skipped = 0;
  for (const it of found) {
    const exists = await sql`SELECT id FROM cafes WHERE name = ${it.name} OR (ABS(lat - ${it.lat}) < 0.0005 AND ABS(lng - ${it.lng}) < 0.0005) LIMIT 1`;
    if (exists.length > 0) { skipped++; continue; }
    const pseudoId = `nl_${it.name.replace(/\s/g, "")}_${Math.round(it.lat * 1e5)}`;
    await sql`
      INSERT INTO cafes (place_id, name, area, address, lat, lng, source, published, roasts_own)
      VALUES (${pseudoId}, ${it.name}, ${storeArea}, ${it.address}, ${it.lat}, ${it.lng}, 'discover', false, false)
      ON CONFLICT (place_id) DO NOTHING`;
    inserted++;
  }
  return { region, found: found.length, inserted, skipped, names: found.map((f) => f.name) };
}
