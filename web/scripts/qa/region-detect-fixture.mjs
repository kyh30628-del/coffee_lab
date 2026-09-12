// 🔒 위반 픽스처 — 지역 판정이 동(洞) 어간 때문에 엉뚱한 시·군으로 가면 실패한다.
//   2026-09-12 실사고: "스타필드 하남"→화천군(하남면) · "구미"→성남시(구미동) · "거제"→부산 연제구(거제동)
//   · "동해"→경남 고성군(동해면) · "상주"→남해군(상주면) · "강서"→청주시(강서동). 8개 중 6개 오판.
//   정답 근거: 행정 위계(시·군·구 > 하위 동) + 네이버 지역검색 실측("스타필드 하남"=경기도 하남시 신장동).
//   실행: node --import tsx scripts/qa/region-detect-fixture.mjs
import fs from 'node:fs';
// .env.local 로드 — Next.js 밖에서 도는 스크립트라 직접 읽어야 lib/db가 연결된다.
for (const l of fs.readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { parseQuery, loadGeoIndex, detectRegion } = await import('../../lib/searchQuery.ts');

const CASES = [
  // [질의, 기대 area, 근거]
  ['스타필드 하남', '하남시', '네이버 지역검색: 경기도 하남시 신장동'],
  ['하남 카페', '하남시', '시(市)가 화천군 하남면보다 우선'],
  ['구미 카페', '구미시', '시가 성남시 구미동보다 우선'],
  ['거제 카페', '거제시', '시가 부산 연제구 거제동보다 우선'],
  ['동해 카페', '동해시', '시가 경남 고성군 동해면보다 우선'],
  ['상주 카페', '상주시', '시가 남해군 상주면보다 우선'],
  ['강서 카페', '강서구', '구가 청주시 강서동보다 우선'],
  ['금천 카페', '금천구', '구가 청주시 금천동보다 우선'],
  ['성남 카페', '성남시', '기존 정상 — 회귀 방지'],
  ['강남 카페', '강남구', '기존 정상 — 회귀 방지'],
  ['연남동 카페', '마포구', '동 판정은 그대로여야 한다'],
  ['성수동 조용한 곳', '성동구', '동 판정 회귀 방지'],
  // 2026-09-12: "○○역/점" 경로가 시·군·구 사전을 건너뛰어 '강남역'의 머리가 진주시 강남동으로 갔다.
  ['강남역 카페', '강남구', '역 이름의 머리도 시·군·구 우선'],
  ['서초역 카페', '서초구', '같은 경로 회귀 방지'],
];
const geo = await loadGeoIndex();
console.log(`지역 인덱스: 시군구 어간 ${geo.sgg.size} · 동 ${geo.dong.size} · area ${geo.area.size}`);
let fail = 0;
for (const [q, want, why] of CASES) {
  const got = detectRegion(parseQuery(q).rawTokens, geo)?.area ?? '(판정없음)';
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? '✅' : '❌'} ${q.padEnd(16)} → ${got.padEnd(12)} (기대 ${want}) ${ok ? '' : '· ' + why}`);
}
console.log(fail ? `\n실패 ${fail}/${CASES.length}` : `\n✅ ${CASES.length}건 전부 통과`);
process.exit(fail ? 1 : 0);
