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
};
// 같은 점수면 '가려는 곳'으로 자주 쓰이는 종류를 먼저 — 역·터미널·공항 > 큰 시설 > 아파트·공원.
//   상호(biz_*)는 같은 이름이 전국에 수백 개씩 있어 랜드마크보다 뒤에 둔다 — '강남역'이 '강남역국밥'보다 먼저.
const PRIO: Record<string, number> = { station: 0, bus_station: 0, aerodrome: 0, department_store: 1, mall: 1, university: 1, hospital: 1, theme_park: 1, stadium: 1, museum: 2, aquarium: 2, zoo: 2, marketplace: 2, cinema: 2, theatre: 2, hotel: 3, apt: 3, library: 3, supermarket: 3, school: 3, peak: 4, townhall: 4, government: 4, park: 5,
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
/** 질의에서 장소명만 남긴다("스타필드 하남 카페" → "스타필드하남"). 장소 검색인지 판단하는 데 쓴다. */
export const placeKey = (q: string) => norm(q).replace(/(카페|커피|맛집|근처|주변|추천|가볼만한곳|가볼만한)/g, "");
export const normName = norm;
const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
const km = (a: number, b: number, c: number, d: number) => {
  const x = rad(c - a), y = rad(d - b);
  return 2 * R * Math.asin(Math.sqrt(Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2));
};

/** 이름으로 장소를 찾는다. near가 있으면 같은 점수 안에서 가까운 곳을 먼저 준다. */
export function searchPlaces(q: string, opts: { limit?: number; near?: [number, number] } = {}): Place[] {
  const nq = norm(q);
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
    s = s * 10 + Math.min(6, Math.floor((nn.length - nq.length) / 3)) + (PRIO[r[3]] ?? 5) * 0.5;
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
