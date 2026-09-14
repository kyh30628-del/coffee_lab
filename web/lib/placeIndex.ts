// 📍 장소 인덱스 — "가려는 곳"(역·백화점·대학·병원·아파트 단지·공원 등 전국 59,504곳)을 이름으로 찾는다.
//
// 왜(2026-09-12 사용자 피드백): 검색이 우리 카페만 뒤져서 "내가 갈 곳"을 못 찾고 지도에서 눈으로 헤매야 했다.
// 💰 비용 규약(CEO 절대규칙):
//   · DB 미사용 — Neon을 깨우지 않는다(장소는 정적 데이터라 DB에 둘 이유가 없다).
//   · 새 엔드포인트 없음 — 기존 /api/search 한 번의 호출 안에서 처리해 함수 호출이 늘지 않는다.
//   · 브라우저 미전송 — data/places.json은 public/이 아니라 함수 번들에만 들어간다(전송 0).
//   · 모듈 로드 시 1회만 파싱해 메모리에 상주(Fluid Compute가 인스턴스를 재사용하므로 사실상 1회).
// 출처: OpenStreetMap(ODbL) + 우리 철도·랜드마크 데이터. 생성: scripts/data/build-places.mjs
import fs from "node:fs";
import path from "node:path";

export type Place = { name: string; lat: number; lng: number; kind: string; label: string; icon: string };
type Row = [string, number, number, string];

const KIND: Record<string, [string, string]> = {
  mall: ["몰", "🛍️"], department_store: ["백화점", "🛍️"], marketplace: ["시장", "🛒"],
  university: ["대학", "🎓"], college: ["대학", "🎓"], hospital: ["병원", "🏥"],
  bus_station: ["터미널", "🚌"], aerodrome: ["공항", "✈️"], stadium: ["경기장", "🏟️"],
  sports_centre: ["체육관", "🏟️"], water_park: ["워터파크", "🏊"], theme_park: ["테마파크", "🎡"],
  zoo: ["동물원", "🦁"], aquarium: ["아쿠아리움", "🐟"], museum: ["박물관", "🏛️"],
  attraction: ["명소", "📍"], theatre: ["공연장", "🎭"], cinema: ["영화관", "🎬"],
  library: ["도서관", "📚"], townhall: ["행정", "🏛️"], government: ["행정", "🏛️"],
  courthouse: ["법원", "⚖️"], hotel: ["호텔", "🏨"], resort: ["리조트", "🏨"],
  park: ["공원", "🌳"], apt: ["아파트", "🏢"], station: ["역", "🚇"], landmark: ["명소", "📍"],
  school: ["학교", "🏫"], kindergarten: ["유치원", "🧸"], place_of_worship: ["종교시설", "⛪"],
  post_office: ["우체국", "📮"], community_centre: ["문화센터", "🏘️"], clinic: ["의원", "🩺"],
  ferry_terminal: ["여객터미널", "⛴️"], supermarket: ["마트", "🛒"], peak: ["산", "⛰️"],
  castle: ["성", "🏯"], monument: ["기념물", "🗿"], memorial: ["기념관", "🗿"], ruins: ["유적", "🏛️"],
  archaeological_site: ["유적", "🏛️"], golf_course: ["골프장", "⛳"], viewpoint: ["전망대", "🔭"], arts_centre: ["문화예술", "🎨"],
  // 상호(2026-09-12 CEO "상호 검색도 넣어") — 전국 상업 POI 219,013건
  biz_food: ["음식점", "🍚"], biz_cafe: ["카페·바", "🍹"], biz_bank: ["은행", "🏦"], biz_care: ["약국·의원", "💊"],
  biz_car: ["주유·세차", "⛽"], biz_edu: ["학원", "📖"], biz_cvs: ["편의점", "🏪"], biz_shop: ["상점", "🛍️"],
  biz_office: ["사무소", "🏢"], biz_gym: ["체육시설", "🏋️"],
  // 🗺️ 2026-09-14(CEO "건물·상호·회사·랜드마크 파워풀하게") — 한국관광공사 TourAPI(공공누리) 16,156건 편입.
  //   실측 실패가 근거다: 서울숲→카페 1곳 · DDP→1곳 · 남산타워→0곳. OSM엔 '서울숲'이 아파트 이름으로만 있었다.
  culture: ["문화시설", "🎨"], leisure: ["레포츠", "⛰️"],   // landmark는 위에 이미 있다
  // 🏢 2026-09-14(결재 #1085) — 상장사 본사. KRX 상장법인 목록 + 네이버 좌표, 시도 교차검증 통과분만.
  company: ["회사", "🏢"],
};
// 같은 점수면 '가려는 곳'으로 자주 쓰이는 종류를 먼저 — 역·터미널·공항 > 큰 시설 > 아파트·공원.
//   상호(biz_*)는 같은 이름이 전국에 수백 개씩 있어 랜드마크보다 뒤에 둔다 — '강남역'이 '강남역국밥'보다 먼저.
//   🔴 2026-09-14 가중치 재설계: 예전엔 점수에 PRIO*0.5만 곱해 길이 페널티(0~6)에 묻혔다.
//     그래서 '코엑스' 질의에 '강남교자 스타필드 코엑스몰점'(biz_food)이 '스타필드 코엑스몰'(mall)을 이겼다.
//     PRIO*2로 올려 **종류가 실제로 순위를 가르게** 한다(같은 종류 안에서는 여전히 이름이 짧은 쪽이 먼저).
//   회사(company)는 상호(biz_*)보다 확실히 앞이어야 한다 — '삼성전자'는 판매점이 아니라 회사를 찾는 질의다.
const PRIO: Record<string, number> = { landmark: 0, attraction: 0, culture: 0, station: 0, bus_station: 0, aerodrome: 0, leisure: 1, company: 2, department_store: 1, mall: 1, university: 1, hospital: 1, theme_park: 1, stadium: 1, museum: 2, aquarium: 2, zoo: 2, marketplace: 2, cinema: 2, theatre: 2, hotel: 3, apt: 3, library: 3, supermarket: 3, school: 3, peak: 4, townhall: 4, government: 4, park: 5,
  biz_food: 6, biz_cafe: 6, biz_shop: 6, biz_cvs: 7, biz_bank: 6, biz_care: 6, biz_car: 6, biz_edu: 6, biz_office: 7, biz_gym: 6 };

let ROWS: Row[] | null = null;
function rows(): Row[] {
  if (ROWS) return ROWS;
  try {
    // Vercel 함수에서는 cwd가 프로젝트 루트다. 로컬 실행도 같다.
    ROWS = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/places.json"), "utf8"));
  } catch { ROWS = []; }                                  // 파일이 없어도 검색은 계속 동작한다(장소만 빠짐)
  return ROWS!;
}
export const placeCount = () => rows().length;

const norm = (s: string) => s.toLowerCase().replace(/[\s·・\-_,()]/g, "");

// 🔤 별칭 — 공식 명칭과 사람이 쓰는 말이 다르다. 실측으로 확인된 것만 등재한다(추측 금지).
//   실패 사례: "남산타워"(공식 남산서울타워) 0건 · "DDP"(공식 동대문디자인플라자) 1건 · "63빌딩"(공식 63스퀘어) 2건.
const ALIAS: Record<string, string> = {
  "남산타워": "남산서울타워", "n서울타워": "남산서울타워", "엔서울타워": "남산서울타워",
  "ddp": "동대문디자인플라자", "동대문dp": "동대문디자인플라자",
  // ⚠️ "코엑스"는 별칭을 넣지 않는다 — 인덱스에 '코엑스'(culture) 정확일치가 이미 있는데
  //   별칭이 '스타필드코엑스몰'로 바꿔버려 정확일치를 놓치고 음식점이 1위가 됐다(실측).
  //   "63빌딩"도 뺀다 — 63스퀘어가 인덱스에 없어 가리킬 대상이 없다.
  "연트럴파크": "경의선숲길", "북꿈숲": "북서울꿈의숲",
  "롯데타워": "롯데월드타워", "잠실롯데타워": "롯데월드타워", "서울스카이": "롯데월드타워서울스카이",
  "예당": "예술의전당", "세종문화": "세종문화회관", "아셈": "코엑스",
  "고터": "고속터미널역", "강남터미널": "고속터미널역", "센트럴시티": "고속터미널역",
  "더현대": "더현대서울", "여의도더현대": "더현대서울",
};
/** 질의에서 장소명만 남긴다("스타필드 하남 카페" → "스타필드하남"). 장소 검색인지 판단하는 데 쓴다. */
export const placeKey = (q: string) => norm(q).replace(/(카페|커피|맛집|근처|주변|추천|가볼만한곳|가볼만한)/g, "");
//   🏢 2026-09-14: 회사 꼬리말을 **뗀 변형**도 따로 만든다. placeKey 자체에서 떼면
//      '삼성전자 서초사옥'처럼 **인덱스 이름에 사옥이 들어간 것**이 도리어 안 맞는다(실측으로 깨뜨렸다가 되돌림).
//      원래 키로 먼저 보고, 안 맞을 때만 이 변형을 쓴다.
export const placeKeyNoSuffix = (q: string) => placeKey(q).replace(/(본사|사옥|오피스|캠퍼스|지사)$/, "");
/** 별칭을 푼 검색키 — 라우트의 장소 판정도 같은 이름을 봐야 한다(2026-09-14: 별칭이 인덱스 안에서만 적용돼
 *  "남산타워"·"고터"·"롯데타워"가 후보는 맞게 찾고도 place 모드로 못 넘어갔다). */
export const placeKeyAliased = (q: string) => { const k = placeKey(q); return ALIAS[k] ? norm(ALIAS[k]) : k; };
/** 정확일치로 볼 수 있는 '확실한 기준점' 종류 — 상호(biz_*)·아파트는 동명이 흔해 제외. */
// 🔤 영문 사명의 **한글 음차** — CEO 지적 2026-09-14 "삼성이앤에이가 왜 검색이 안 되냐".
//   원인: KRX 공식명은 '삼성E&A'인데 사람은 '삼성이앤에이'로 친다. 지금은 'CU 삼성이앤에이점'(편의점)만 잡혔다.
//   특정 회사만 손으로 넣으면 LG씨엔에스·HD현대·SK이터닉스…가 전부 같은 문제를 낸다(영문 포함 사명 242곳).
//   → 알파벳을 한글 읽기로 바꾼 **별칭 이름을 만들어** 같은 좌표로 한 줄 더 둔다. 일반 해법이라 앞으로 들어올 회사도 자동.
const LETTER_KO: Record<string, string> = {
  a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지", h: "에이치", i: "아이",
  j: "제이", k: "케이", l: "엘", m: "엠", n: "엔", o: "오", p: "피", q: "큐", r: "알",
  s: "에스", t: "티", u: "유", v: "브이", w: "더블유", x: "엑스", y: "와이", z: "제트", "&": "앤",
};
/** "삼성E&A" → "삼성이앤에이". 한글로 읽히지 않는 글자가 있으면 null(억지로 만들지 않는다). */
export function koreanizeName(name: string): string | null {
  if (!/[A-Za-z&]/.test(name)) return null;
  let out = "", changed = false;
  for (const ch of name) {
    const k = LETTER_KO[ch.toLowerCase()];
    if (k) { out += k; changed = true; }
    else if (/[0-9가-힣]/.test(ch)) out += ch;
    else if (/\s/.test(ch)) out += "";
    else return null;                       // 해석 못 하는 기호가 있으면 만들지 않는다
  }
  return changed && out.length >= 2 ? out : null;
}

export const isAnchorKind = (k: string) => ["landmark", "attraction", "culture", "leisure", "park", "station", "bus_station", "aerodrome", "mall", "department_store", "university", "theme_park", "stadium", "museum", "aquarium", "marketplace", "company"].includes(k);
export const normName = norm;
const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
const km = (a: number, b: number, c: number, d: number) => {
  const x = rad(c - a), y = rad(d - b);
  return 2 * R * Math.asin(Math.sqrt(Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2));
};

// 🔁 폴백용 — 질의가 인덱스 이름보다 길면 부분일치가 통째로 실패한다(실측: "여의도 IFC몰" → 0건, 인덱스엔 "IFC 서울").
//   ① 일반 접미어(몰·빌딩·타워…)를 떼고 ② 그래도 없으면 가장 긴 토큰으로 다시 찾는다. 둘 다 원질의보다 느슨하므로
//   **원질의로 찾은 결과가 하나라도 있으면 절대 쓰지 않는다**(느슨한 매칭이 정확한 결과를 밀어내면 안 된다).
//   🏢 2026-09-14: 회사 꼬리말(본사·사옥…)도 폴백 접미어에 넣는다 — "네이버 본사"가 그대로 0건이었다.
//   ⚠️ 폴백은 **원질의로 못 찾았을 때만** 돈다. '삼성전자 서초사옥'은 정확일치라 여기까지 오지 않는다(실측 확인).
const GENERIC_TAIL = /(몰|빌딩|타워|센터|쎈터|프라자|플라자|백화점|아울렛|본사|사옥|오피스|캠퍼스|지사|점)$/;
function fallbackKeys(nq: string, raw: string): string[] {
  const out: string[] = [];
  const stripped = nq.replace(GENERIC_TAIL, "");
  if (stripped.length >= 2 && stripped !== nq) out.push(stripped);
  const toks = String(raw).split(/[\s·・,]+/).map((t) => norm(t)).filter((t) => t.length >= 2);
  if (toks.length > 1) {
    const longest = toks.slice().sort((a, b) => b.length - a.length)[0];
    if (longest && !out.includes(longest)) out.push(longest);
    const ls = longest.replace(GENERIC_TAIL, "");
    if (ls.length >= 2 && !out.includes(ls)) out.push(ls);
  }
  return out;
}

/** 이름으로 장소를 찾는다. near가 있으면 같은 점수 안에서 가까운 곳을 먼저 준다. */
export function searchPlaces(q: string, opts: { limit?: number; near?: [number, number] } = {}): Place[] {
  const direct = searchPlacesExact(q, opts);
  if (direct.length) return direct;
  const nq0 = ALIAS[norm(q)] ? norm(ALIAS[norm(q)]) : norm(q);
  for (const k of fallbackKeys(nq0, q)) {
    const r = searchPlacesExact(k, opts);
    if (r.length) return r;
  }
  return [];
}

function searchPlacesExact(q: string, opts: { limit?: number; near?: [number, number] } = {}): Place[] {
  const nq0 = norm(q);
  const nq = ALIAS[nq0] ? norm(ALIAS[nq0]) : nq0;
  if (nq.length < 2) return [];                            // 1글자는 후보가 수천 개 — 의미 없다
  const limit = opts.limit ?? 6;
  const scored: { r: Row; s: number; d: number }[] = [];
  for (const r of rows()) {
    const nn = norm(r[0]);
    let s: number;
    if (nn === nq) s = 0;
    else if (nn.startsWith(nq)) s = 1;
    else if (nn.includes(nq)) s = 2;
    else continue;
    // 질의가 이름의 대부분을 차지할수록(= 군더더기가 적을수록) 위로.
    s = s * 10 + Math.min(6, Math.floor((nn.length - nq.length) / 3)) + (PRIO[r[3]] ?? 5) * 2;
    const d = opts.near ? km(opts.near[0], opts.near[1], r[1], r[2]) : 0;
    scored.push({ r, s, d });
    if (scored.length > 4000) break;                       // 과도한 일반어 방어(상한 도달 시 그만)
  }
  scored.sort((a, b) => a.s - b.s || a.d - b.d || a.r[0].length - b.r[0].length);
  const out: Place[] = []; const kept: Row[] = [];
  for (const { r } of scored) {
    // 같은 이름은 5km 안에서 한 번만(지하철역+기차역·본관+별관 중복 제거). 멀면 다른 도시의 동명 장소라 남긴다.
    if (kept.some((k) => k[0] === r[0] && km(k[1], k[2], r[1], r[2]) < 5)) continue;
    kept.push(r);
    const [label, icon] = KIND[r[3]] ?? ["장소", "📍"];
    out.push({ name: r[0], lat: r[1], lng: r[2], kind: r[3], label, icon });
    if (out.length >= limit) break;
  }
  return out;
}
