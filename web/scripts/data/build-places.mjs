#!/usr/bin/env node
// 📍 전국 장소 인덱스 — "내가 갈 곳"(건물·시설·아파트 단지)을 검색해 지도로 이동시키기 위한 원장.
//
// 왜(2026-09-12 사용자 피드백): 검색이 우리 카페 이름·느낌만 뒤져서, 가려는 곳(백화점·대학·병원·아파트)을
//   찾을 수 없어 지도에서 눈으로 헤매야 했다.
// 💰 비용 설계: 이 파일은 **public/에 두지 않는다**(브라우저로 안 보낸다). 함수 번들에 넣어 서버 메모리에서만 쓴다.
//   DB 미사용(Neon 0) · 새 API 없음(기존 /api/search 안에서 처리 → 함수 호출 증가 0) · 응답에 몇 건만 더 붙는다.
// 출처: OpenStreetMap(Overpass), ODbL — 지도 하단에 출처 표기 있음. 무료·키 없음.
// 실행: scripts/data/fetch-places.sh <tmp> && node scripts/data/build-places.mjs <tmp>
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '../..');
const els = [
  ...(JSON.parse(fs.readFileSync(path.join(SRC, 'ov-places.json'), 'utf8')).elements || []),
  // 2차 확장(2026-09-12 CEO "장소 검색도 더 풍부해야 한다") — 학교·종교시설·마트·산·사적지 등 '근처'의 기준점이 되는 것들.
  ...(fs.existsSync(path.join(SRC, 'ov-places2.json')) ? (JSON.parse(fs.readFileSync(path.join(SRC, 'ov-places2.json'), 'utf8')).elements || []) : []),
  // 3차(2026-09-12): 태그가 아니라 **이름**으로 긁은 주거단지.
  //   실사고: "구리 한일"이 안 나왔다. 구리 토평동 한일아파트는 OSM에 있는데 building/landuse 태그가 하나도 없어
  //   태그 기준 필터(building=apartments · landuse=residential)에 안 걸렸다. 전국 "…아파트" 이름만 24,970개.
  ...(fs.existsSync(path.join(SRC, 'ov-apt.json')) ? (JSON.parse(fs.readFileSync(path.join(SRC, 'ov-apt.json'), 'utf8')).elements || []) : []),
  // 4차(2026-09-12 CEO "상호 검색도 넣어"): 이름 있는 상업 POI 전국 219,013건
  //   — 식당·미용실·편의점·카페·마트·은행·주유소·약국·학원·헬스장·사무소 등. "○○식당 근처 카페"가 되게.
  ...(fs.existsSync(path.join(SRC, 'ov-biz.json')) ? (JSON.parse(fs.readFileSync(path.join(SRC, 'ov-biz.json'), 'utf8')).elements || []) : []),
];

// 종류 코드 — 검색 결과에 아이콘·라벨로 쓴다. 여기 없는 태그는 버린다(우체통·화장실 같은 잡음 차단).
const KIND = {
  mall: ['몰', '🛍️'], department_store: ['백화점', '🛍️'], marketplace: ['시장', '🛒'],
  university: ['대학', '🎓'], college: ['대학', '🎓'],
  hospital: ['병원', '🏥'],
  bus_station: ['터미널', '🚌'], aerodrome: ['공항', '✈️'],
  stadium: ['경기장', '🏟️'], sports_centre: ['체육관', '🏟️'], water_park: ['워터파크', '🏊'],
  theme_park: ['테마파크', '🎡'], zoo: ['동물원', '🦁'], aquarium: ['아쿠아리움', '🐟'],
  museum: ['박물관', '🏛️'], attraction: ['명소', '📍'], theatre: ['공연장', '🎭'], cinema: ['영화관', '🎬'],
  library: ['도서관', '📚'], townhall: ['행정', '🏛️'], government: ['행정', '🏛️'], courthouse: ['법원', '⚖️'],
  hotel: ['호텔', '🏨'], resort: ['리조트', '🏨'], park: ['공원', '🌳'],
  apt: ['아파트', '🏢'], station: ['역', '🚇'], landmark: ['명소', '📍'],
  school: ['학교', '🏫'], kindergarten: ['유치원', '🧸'], place_of_worship: ['종교시설', '⛪'],
  post_office: ['우체국', '📮'], community_centre: ['문화센터', '🏘️'], clinic: ['의원', '🩺'],
  ferry_terminal: ['여객터미널', '⛴️'], supermarket: ['마트', '🛒'], peak: ['산', '⛰️'],
  castle: ['성', '🏯'], monument: ['기념물', '🗿'], memorial: ['기념관', '🗿'], ruins: ['유적', '🏛️'],
  archaeological_site: ['유적', '🏛️'], golf_course: ['골프장', '⛳'], viewpoint: ['전망대', '🔭'], arts_centre: ['문화예술', '🎨'],
  biz_food: ['음식점', '🍚'], biz_cafe: ['카페·바', '🍹'], biz_bank: ['은행', '🏦'], biz_care: ['약국·의원', '💊'],
  biz_car: ['주유·세차', '⛽'], biz_edu: ['학원', '📖'], biz_cvs: ['편의점', '🏪'], biz_shop: ['상점', '🛍️'],
  biz_office: ['사무소', '🏢'], biz_gym: ['체육시설', '🏋️'],
};
const APT_NAME = /(아파트|빌라|맨션|타운|단지|캐슬|자이|푸르지오|힐스테이트|래미안|편한세상|더샵|아이파크|위브|스위첸|데시앙|비발디|리슈빌|어울림|센트레빌|해모로|베르디움|파크뷰|팰리스)$/;
const kindOf = (t) => {
  if (t.landuse === 'residential' || t.building === 'apartments') return 'apt';
  // 태그가 없어도 이름이 주거단지형이면 아파트로 본다(위 3차 수집분).
  if (APT_NAME.test((t['name:ko'] || t.name || '').trim())) return 'apt';
  for (const k of ['shop', 'amenity', 'tourism', 'leisure', 'aeroway', 'office', 'natural', 'historic']) {
    const v = t[k]; if (v && KIND[v]) return v === 'government' ? 'government' : v;
  }
  // 위 표에 없는 상업 POI는 큰 갈래로 접는다 — 종류를 다 나열하는 대신 화면에 쓸 라벨만 맞춘다.
  if (t.amenity === 'restaurant' || t.amenity === 'fast_food' || t.amenity === 'food_court') return 'biz_food';
  if (t.amenity === 'cafe' || t.amenity === 'bar' || t.amenity === 'pub' || t.amenity === 'ice_cream') return 'biz_cafe';
  if (t.amenity === 'bank') return 'biz_bank';
  if (t.amenity === 'pharmacy' || t.amenity === 'dentist' || t.amenity === 'veterinary') return 'biz_care';
  if (t.amenity === 'fuel' || t.amenity === 'car_wash') return 'biz_car';
  if (t.amenity === 'language_school' || t.amenity === 'driving_school') return 'biz_edu';
  if (t.shop === 'convenience') return 'biz_cvs';
  if (t.shop) return 'biz_shop';
  if (t.office) return 'biz_office';
  if (t.leisure) return 'biz_gym';
  return null;
};
// 아파트 동 이름("래미안 101동", "101동")은 단지명으로 접는다.
const aptName = (n) => n.replace(/\s*제?\d+[-\d]*\s*동\s*$/, '').replace(/\s*\d+차\s*$/, (m) => m).trim();

const rows = [];
for (const e of els) {
  const t = e.tags || {}; const kind = kindOf(t); if (!kind) continue;
  const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
  if (lat == null || lng == null) continue;
  let n = (t['name:ko'] || t.name || '').trim();
  if (kind === 'apt') { n = aptName(n); if (!/아파트|마을|타운|빌리지|캐슬|자이|래미안|힐스테이트|푸르지오|e편한세상|더샵|아이파크|롯데캐슬|위브|스위첸|리슈빌|한라비발디|데시앙|호반|중흥|부영|주공|리버파크|팰리스|시티|파크|센트럴|타워/.test(n) && n.length < 4) continue; }
  if (!n || n.length < 2 || n.length > 30) continue;
  if (/^\d+$/.test(n)) continue;
  rows.push({ n, lat, lng, k: kind });
}

// 철도역·랜드마크도 같은 인덱스에 넣는다 — 사용자에겐 다 "갈 곳"이다(역 1,332 · 랜드마크 1,315).
{
  for (const st of JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/stations.json'), 'utf8')))
    rows.push({ n: st.n + '역', lat: st.lat, lng: st.lng, k: 'station' });
  for (const [n, lat, lng] of JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/landmarks.json'), 'utf8')))
    if (n && lat && lng) rows.push({ n, lat, lng, k: 'landmark' });
}

// 중복 제거 — 같은 이름이 300m 안에 여러 번(동별 건물·폴리곤+노드 중복). 가장 먼저 것만 남긴다.
const seen = new Map();
const cell = (v) => Math.round(v / 0.003);
const out = [];
for (const r of rows) {
  const key = `${r.n}|${cell(r.lat)}_${cell(r.lng)}`;
  if (seen.has(key)) continue;
  seen.set(key, 1);
  out.push(r);
}
// 같은 이름이 전국에 여러 개면(주민센터·이마트 등) 다 남긴다 — 검색 시 화면 중심에서 가까운 걸 먼저 보여준다.

const round5 = (v) => Math.round(v * 1e5) / 1e5;
const packed = out.map((r) => [r.n, round5(r.lat), round5(r.lng), r.k]);
packed.sort((a, b) => a[0].localeCompare(b[0]));
const file = path.join(ROOT, 'data/places.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(packed));
const byKind = {}; for (const p of packed) byKind[p[3]] = (byKind[p[3]] || 0) + 1;
console.log(`장소 ${packed.length.toLocaleString()}건 · ${Math.round(fs.statSync(file).size / 1024)}KB (서버 전용, 브라우저 미전송)`);
console.log(Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${(KIND[k] || [k])[0]}:${v}`).join(' · '));
