// 🧪 지역 분류·매칭 픽스처 — 배선 배포 전 필수 통과(2026-09-06 부산·경남 편입 확장판).
//   과거 위반 사례를 픽스처로 박제: 남동구⊅동구(07-26)·대전 153(09-04)·경남/강원 고성군(09-06).
const { classifyArea, canonicalGu, areaMatchesRegion, regionKeyFor } = await import("../lib/regionList.ts");
const cases = [
  // [area, 기대 sido, 기대 canonicalGu]
  ["강남구", "서울", "강남구"],
  ["중구", "서울", "중구"],                     // bare 중구 = 서울(기존 데이터 관례)
  ["인천 중구", "인천", "인천 중구"],
  ["대전 중구", "대전", "대전 중구"],
  ["부산 중구", "부산", "부산 중구"],            // 신규
  ["부산 강서구", "부산", "부산 강서구"],        // 신규 — 서울 강서구와 충돌
  ["강서구", "서울", "강서구"],                  // bare = 서울 유지
  ["해운대구", "부산", "부산 해운대구"],        // 접두 시도는 전 구 접두(인천 남동구 관례, DB 실물 351곳 확인)
  ["기장군", "부산", "부산 기장군"],
  ["창원시", "경남", "창원시"],
  ["김해시", "경남", "김해시"],
  ["고성군", "강원", "고성군"],                  // 🔴 bare 고성군 = 강원(공개 61곳 보존)
  ["경남 고성군", "경남", "경남 고성군"],        // 🔴 경남 쪽은 접두 라벨
  ["남해군", "경남", "남해군"],
  ["춘천시", "강원", "춘천시"],
  ["청주시", "충북", "청주시"],
  ["천안시", "충남", "천안시"],
  ["남동구", "인천", "인천 남동구"],          // bare 잔재도 표준키로 정규화
];
let fail = 0;
for (const [a, sido, key] of cases) {
  const c = classifyArea(a); const k = canonicalGu(a);
  const ok = c.sido === sido && k === key;
  if (!ok) { fail++; console.log(`❌ ${a} → sido=${c.sido}(기대 ${sido}) key=${k}(기대 ${key})`); }
}
// 매칭 매트릭스
const m = [
  ["고성군", "강원", true], ["고성군", "경남", false],
  ["경남 고성군", "경남", true], ["경남 고성군", "강원", false],
  ["경남 고성군", "고성군", false],              // bare 키(강원)와 불일치
  ["부산 중구", "부산", true], ["부산 중구", "서울", false], ["부산 중구", "중구", false],
  ["중구", "서울", true], ["중구", "부산", false],
  ["남동구", "동구", false],                     // 07-26 부분일치 금지 박제
  ["창원시", "경남", true], ["창원시", "경북", false],
  ["부산 강서구", "부산 강서구", true], ["강서구", "부산 강서구", false],
];
for (const [a, r, want] of m) {
  const got = areaMatchesRegion(a, r);
  if (got !== want) { fail++; console.log(`❌ match("${a}","${r}") = ${got} (기대 ${want})`); }
}
// regionKeyFor 직접
if (regionKeyFor("경남", "고성군") !== "경남 고성군") { fail++; console.log("❌ regionKeyFor 경남 고성군"); }
if (regionKeyFor("강원", "고성군") !== "고성군") { fail++; console.log("❌ regionKeyFor 강원 고성군"); }
if (regionKeyFor("부산", "중구") !== "부산 중구") { fail++; console.log("❌ regionKeyFor 부산 중구"); }
console.log(fail === 0 ? `✅ 픽스처 전건 통과 (분류 ${cases.length} + 매칭 ${m.length} + 키 3)` : `❌ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
