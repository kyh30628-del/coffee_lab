// 🔒 위반 픽스처 — 지역 편입 시 regionList(SIDO_GU)와 serviceScope(OUT_OF_SCOPE)가 어긋나면 실패한다.
//   2026-09-12 사고: 대구·경북을 regionList에만 넣어 공개 1,062곳이 "범위 밖"으로 즉시 제외됐다.
import { SIDO_GU } from '../../lib/regionList.ts';
import { OUT_OF_SCOPE_PREFIXES } from '../../lib/serviceScope.ts';
import { BASE_BY_KEY } from '../../lib/criteriaListsBase.ts';
const ALIAS = { '대구': ['대구'], '경북': ['경상북도','경북'], '경남': ['경상남도','경남'], '부산': ['부산'], '강원': ['강원'], '충북': ['충청북도','충북'], '충남': ['충청남도','충남'], '대전': ['대전'], '세종': ['세종'], '서울': ['서울'], '경기': ['경기'], '인천': ['인천'] };
let fail = 0;
for (const sido of Object.keys(SIDO_GU)) {
  for (const a of (ALIAS[sido] || [sido])) {
    const hit = OUT_OF_SCOPE_PREFIXES.find((p) => a.startsWith(p) || p.startsWith(a));
    if (hit) { console.log(`❌ ${sido}: 개방 지역인데 OUT_OF_SCOPE에 '${hit}'가 남아 있다 — 공개 즉시 제외된다`); fail++; }
  }
}
// ② 검색의 '미서비스 지역 키워드'에도 개방 지역이 남아 있으면 안 된다.
//   2026-09-12 실사고: 대구·경북 1,432곳을 공개하고 공지까지 띄웠는데 "대구 카페" 검색에
//   "'대구' 지역 카페는 아직 포함되어 있지 않아요"가 떴다(소비자 화면 실손상).
const cov = BASE_BY_KEY['search.out_of_coverage'] ?? [];
const SIDO_CITY = { '대구': ['대구','포항','경주','안동','구미','경북','경상북도'], '경북': ['경북','경상북도','포항','경주','안동','구미'],
  '부산': ['부산'], '경남': ['경남','창원','진주','통영','김해','거제','양산','밀양','마산'], '강원': ['강원','강릉','속초','춘천','원주'],
  '충북': ['충북','청주','충주','제천'], '충남': ['충남','천안','아산','서산','안면도'], '대전': ['대전'], '세종': ['세종'],
  '서울': ['서울'], '경기': ['경기'], '인천': ['인천'] };
for (const sido of Object.keys(SIDO_GU)) {
  for (const kw of (SIDO_CITY[sido] || [sido])) {
    if (cov.includes(kw)) { console.log(`❌ ${sido}: 개방 지역인데 미서비스 키워드에 '${kw}'가 남아 있다 — 검색에 거짓 안내가 나간다`); fail++; }
  }
}
console.log(fail ? `실패 ${fail}건` : `✅ 개방 시·도 ${Object.keys(SIDO_GU).length}개 — 서비스 범위·미서비스 키워드 어긋남 0`);
process.exit(fail ? 1 : 0);
