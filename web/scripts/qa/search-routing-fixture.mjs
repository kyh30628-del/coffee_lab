// 🔀 검색 라우팅 픽스처 — CEO 지시(2026-09-12): "카페 느낌·카페 자체 정보와 장소 검색의 라우팅이 정확해야 한다".
//   질의 성격에 따라 올바른 경로로 가는지 결정론 검사. 잘못 라우팅되면 실패한다.
//     place    = 건물·아파트·역·시설을 물음 → 그 좌표 주변 카페(거리순)
//     region   = 지역만 물음("홍대 카페") → 그 동네 대표 카페
//     semantic = 카페의 느낌·속성을 물음 → 의미 검색 (장소로 새면 안 된다)
//   실행: node scripts/qa/search-routing-fixture.mjs [base]
const BASE = process.argv[2] || 'http://localhost:3111';
const CASES = [
  // ── 장소(건물·아파트·역·시설) — 주변 카페가 나와야 한다
  ['반포자이아파트', 'place'], ['래미안수성', 'place'], ['스타필드 하남', 'place'],
  ['동대구역', 'place'], ['서울대학교', 'place'], ['성수역 카페', 'place'],
  // ── 지역만 — 그 동네 대표
  ['홍대 카페', 'region'], ['잠실역 카페', 'place'],
  // ── 🔴 장소 하이재킹 회귀 방지(2026-09-12 실사고): '연희동 카페'가 장소 '연희동물병원'(인천)에 걸려
  //    인천 카페를 주고, '신사동 카페'는 '신사동산'(용인)에 걸렸다. 정식 행정동은 지역 검색이 정답이다.
  ['연희동 카페', 'region'], ['신사동 카페', 'region'], ['성내동 카페', 'region'], ['신림동 카페', 'region'],
  ['망원동 카페', 'region'], ['익선동 카페', 'region'],
  // ── 카페의 느낌·정보 — 절대 장소로 새면 안 된다(우리 본래 강점)
  ['조용한 카페', 'semantic'], ['작업하기 좋은 카페', 'semantic'], ['산미 있는 스페셜티 원두', 'semantic'],
  ['루프탑 야경 보이는 카페', 'semantic'], ['소금빵 맛있는 베이커리', 'semantic'],
  ['강남 작업하기 좋은 카페', 'semantic'], ['성수동 디저트 맛있는 카페', 'semantic'],
  ['고양이 있는 카페', 'semantic'], ['직접 로스팅하는 곳', 'semantic'],
  // ── 카페 상호
  ['블루보틀', 'semantic'], ['프릳츠', 'semantic'],
];
let fail = 0;
for (const [q, want] of CASES) {
  let got = '(오류)', n = 0;
  try {
    const j = await (await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}&nocache=1`)).json();
    got = j.mode === 'ai' ? 'semantic' : j.mode; n = j.count ?? 0;   // ai 재정렬은 semantic 경로의 후처리
  } catch {}
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? '✅' : '❌'} ${q.padEnd(22)} ${String(got).padEnd(9)} (기대 ${want}) ${n}곳`);
}
console.log(fail ? `\n실패 ${fail}/${CASES.length}` : `\n✅ 라우팅 ${CASES.length}건 전부 정확`);
process.exit(fail ? 1 : 0);
