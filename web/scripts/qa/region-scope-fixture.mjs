// 🔒 위반 픽스처 — 지역 편입 시 regionList(SIDO_GU)와 serviceScope(OUT_OF_SCOPE)가 어긋나면 실패한다.
//   2026-09-12 사고: 대구·경북을 regionList에만 넣어 공개 1,062곳이 "범위 밖"으로 즉시 제외됐다.
import { SIDO_GU } from '../../lib/regionList.ts';
import { OUT_OF_SCOPE_PREFIXES } from '../../lib/serviceScope.ts';
const ALIAS = { '대구': ['대구'], '경북': ['경상북도','경북'], '경남': ['경상남도','경남'], '부산': ['부산'], '강원': ['강원'], '충북': ['충청북도','충북'], '충남': ['충청남도','충남'], '대전': ['대전'], '세종': ['세종'], '서울': ['서울'], '경기': ['경기'], '인천': ['인천'] };
let fail = 0;
for (const sido of Object.keys(SIDO_GU)) {
  for (const a of (ALIAS[sido] || [sido])) {
    const hit = OUT_OF_SCOPE_PREFIXES.find((p) => a.startsWith(p) || p.startsWith(a));
    if (hit) { console.log(`❌ ${sido}: 개방 지역인데 OUT_OF_SCOPE에 '${hit}'가 남아 있다 — 공개 즉시 제외된다`); fail++; }
  }
}
console.log(fail ? `실패 ${fail}건` : `✅ 개방 시·도 ${Object.keys(SIDO_GU).length}개 모두 서비스 범위 안 — 어긋남 0`);
process.exit(fail ? 1 : 0);
