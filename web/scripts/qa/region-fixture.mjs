// 🧪 대구·경북 편입 픽스처 — 라벨·판정이 기존 지역을 깨지 않는지 고정 검증.
const { SIDO_GU, PREFIXED_SIDOS, regionKeyFor, classifyArea, areaMatchesRegion } = await import("../../lib/regionList.ts");
let ok = 0, fail = 0;
const t = (label, got, want) => { const p = JSON.stringify(got) === JSON.stringify(want); p ? ok++ : fail++; if (!p) console.log(`  ❌ ${label}\n     got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
// 라벨 생성
t("대구 중구 접두", regionKeyFor("대구", "중구"), "대구 중구");
t("대구 수성구 접두", regionKeyFor("대구", "수성구"), "대구 수성구");
t("경북 포항시 bare", regionKeyFor("경북", "포항시"), "포항시");
t("서울 중구 bare 유지", regionKeyFor("서울", "중구"), "중구");
t("부산 중구 유지", regionKeyFor("부산", "중구"), "부산 중구");
t("강원 고성군 bare 유지", regionKeyFor("강원", "고성군"), "고성군");
t("경남 고성군 접두 유지", regionKeyFor("경남", "고성군"), "경남 고성군");
// 역판정
t("대구 중구 역판정", classifyArea("대구 중구"), { sido: "대구", sigungu: "중구" });
t("중구 → 서울", classifyArea("중구"), { sido: "서울", sigungu: "중구" });
t("포항시 → 경북", classifyArea("포항시"), { sido: "경북", sigungu: "포항시" });
t("경산시 → 경북", classifyArea("경산시"), { sido: "경북", sigungu: "경산시" });
// 군위군은 대구, 경북에 없어야 한다
t("군위군은 대구 소속", SIDO_GU["대구"].includes("군위군"), true);
t("군위군은 경북에 없음", SIDO_GU["경북"].includes("군위군"), false);
t("울릉군 포함", SIDO_GU["경북"].includes("울릉군"), true);
t("경북 22개", SIDO_GU["경북"].length, 22);
// 기존 지역 개수 불변
t("서울 25(자치구 수 불변)", SIDO_GU["서울"].length, 25);
t("부산 16", SIDO_GU["부산"].length, 16);
console.log(`\n${ok}/${ok + fail} 통과${fail ? " ❌" : " ✅"}`);
process.exit(fail ? 1 : 0);
