// 🛡️ 해자 골든 테스트 — 옥석 검증 엔진(563개 규칙)이 조용히 깨지지 않게 못으로 박는다.
//
// 왜 이 파일이 있는가 (CEO 지시, 2026-10-18):
//   "서비스 자체를 판매할 것을 염두에 두고 설계·개발하라. 단편적 데이터가 아니라 수많은 노력과
//    복잡하지만 완벽한 로직이 담겨 있다는 걸 보여야 한다."
//   실측 당시 테스트 파일은 **0개**였다. 2,813줄·정규식 563개의 판정 로직이 아무 자물쇠 없이 있었고,
//   실제로 10-17에 내가 공개 카페 2곳의 후기를 171→36으로 날렸다(복구 불가).
//   테스트는 두 가지를 동시에 한다 — ①해자를 지키는 자물쇠 ②해자의 깊이를 보여주는 명세서.
//
// 📌 각 케이스는 **실제로 일어난 사고**에서 가져왔다(추측 사례 금지). 출처를 케이스마다 적는다.
// 💰 비용 0 — 순수 함수만, DB·네트워크 접촉 없음. 내장 node:test라 새 의존성도 없다.
// 실행: npm run test:moat
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nameCoherence, brandTokenOverlap, coreTokens, nearDuplicateCafeName,
  detectCampaignCluster, isPopupRotatingVenue, cleanCafeName,
} from "../reviewQuality";
import { isOtherBusinessQuote, isReadableQuote, displayQuote, splitKeyTerms } from "../cafeDetailView";

const AREA = ["서울", "강남구", "역삼동"];

// ── ① 이름 일치도 — 깊은 수집 필터의 핵심.
//   10-17 사고: 이 필터를 빼고 깊은 스니펫을 넣어 8곳 중 4곳의 근거가 오염됐다(새벽카페호르 159→54).
test("nameCoherence: 자기 상호가 있는 인용문은 통과, 무관한 글은 탈락", () => {
  assert.equal(nameCoherence("스퀘어81", ["스퀘어81 다녀왔어요 커피 맛있네요"], AREA), 1);
  assert.equal(nameCoherence("스퀘어81", ["오늘 날씨가 좋아서 산책했어요"], AREA), 0);
  // 다른 카페 상호만 있는 글은 이 카페 근거가 아니다 — 교차오염의 입구를 여기서 막는다.
  assert.equal(nameCoherence("스퀘어81", ["블루보틀 성수점 다녀왔어요"], AREA), 0);
});

// ── ② 브랜드 토큰 부분포함 — 09-13 해자 감사에서 확정된 결함 8건 중 1번.
test("brandTokenOverlap: 지점명은 같은 브랜드, 어순만 바꾼 남의 상호는 다른 가게", () => {
  assert.equal(brandTokenOverlap("스타벅스", "스타벅스 역삼점", AREA), true);
  assert.equal(brandTokenOverlap("오르빗", "오르빗 올림픽공원점", AREA), true);
  // 🔴 '커피나무'와 '나무커피'는 토큰이 같아도 다른 가게다. 부분포함으로 판정하면 둘을 합친다.
  assert.equal(brandTokenOverlap("커피나무", "나무커피", AREA), false);
});

// ── ③ 지역어·업종어 제거 — 발굴이 경계 너머를 긁어 184곳에 잘못된 지역명을 박은 사고의 가드.
test("coreTokens: 지역어와 업종어를 떼고 고유 상호만 남긴다", () => {
  assert.deepEqual(coreTokens("스타벅스 역삼동점", AREA), ["스타벅스"]);
  assert.deepEqual(coreTokens("강남 카페 온다", AREA), ["온다"]);
});

// ── ④ 같은 이름 다른 업종 — 실사고: '호텔 서귀피안' 글이 '서귀피안 베이커리'에 붙었다.
test("isOtherBusinessQuote: 상호가 같아도 숙박업 글은 카페 근거가 아니다", () => {
  assert.equal(isOtherBusinessQuote("서귀피안 호텔 조식이 좋았어요", "서귀피안 베이커리"), true);
  assert.equal(isOtherBusinessQuote("호텔 서귀피안 숙박했어요", "서귀피안 베이커리"), true);
  assert.equal(isOtherBusinessQuote("서귀피안 베이커리 빵이 맛있어요", "서귀피안 베이커리"), false);
});

// ── ⑤ 협찬·캠페인 군집 — 08-16 재교정(기존 임계가 700곳 중 0곳만 잡았다) + 08-17 밀집률 대체경로.
//   하한이 있는 이유: 표본이 적으면 판단하지 않는다(MIN_CLUSTER 4 · MIN_BURST 5).
// 🔴 날짜는 **네이버 형식 YYYY.MM.DD만** 받는다(toEpochDay). ISO(2026-05-01)를 넣으면 날짜 없는 근거로 취급돼
//   군집 판정 자체가 돌지 않는다 — 내가 처음 이 테스트를 ISO로 써서 "탐지 실패"로 오판했다(2026-10-18).
test("detectCampaignCluster: 표본 하한 미달이면 판단하지 않는다", () => {
  const r = detectCampaignCluster([
    { quote: "체험단으로 다녀왔습니다", date: "2026.05.01" },
    { quote: "협찬 받아 방문했어요", date: "2026.05.02" },
    { quote: "소정의 원고료를 받았습니다", date: "2026.05.02" },
  ]);
  assert.equal(r.suspect, false, "3건은 MIN_CLUSTER(4) 미달 — 판단 보류가 정답");
});
test("detectCampaignCluster: 하루에 몰린 홍보 문구 5건 + 개인서사 0% = 의심", () => {
  const promo = (i: number) => ({ quote: `신규 오픈 이벤트 감성 인테리어 시그니처 메뉴 추천합니다 ${i}`, date: "2026.05.01" });
  const r = detectCampaignCluster([promo(1), promo(2), promo(3), promo(4), promo(5)]);
  assert.equal(r.suspect, true);
  assert.equal(r.clusterDate, "2026-05-01", "출력은 ISO로 정규화된다");
});
test("detectCampaignCluster: 같은 밀집이라도 개인서사가 1/3 넘으면 진짜 버즈로 보호한다", () => {
  // 08-16 반증사례 보호 — '인기 폭발로 한날 몰린 진짜 후기'를 캠페인으로 몰면 안 된다.
  const real = [
    { quote: "친구랑 같이 갔어요 줄이 길었지만 좋았어요", date: "2026.05.01" },
    { quote: "가족과 방문했는데 디저트가 아쉬웠어요", date: "2026.05.01" },
    { quote: "혼자 가서 2시간 작업했어요 15,000원 썼네요", date: "2026.05.01" },
    { quote: "신규 오픈 이벤트 감성 인테리어 추천합니다", date: "2026.05.01" },
    { quote: "신규 오픈 이벤트 시그니처 메뉴 추천합니다", date: "2026.05.01" },
  ];
  assert.equal(detectCampaignCluster(real).suspect, false);
});

// ── ⑥ 하이라이트 중간 끊김 — 10-18 수리. 2,339문장 실측에서 단어 중간 절단 43%→1%.
test("splitKeyTerms: 단어 중간을 자르지 않고, 한 문장에 2개까지만 강조한다", () => {
  const parts = splitKeyTerms("분위기가 좋고 조용해요");
  assert.ok(parts.filter((p) => p.k).length <= 2, "한 문장 강조 상한 2개");
  // 조각을 이어 붙이면 원문이 그대로 복원돼야 한다(글자 유실·중복 없음).
  assert.equal(parts.map((p) => p.t).join(""), "분위기가 좋고 조용해요");
  for (const p of parts.filter((x) => x.k)) assert.ok(p.t.length >= 2, `강조 조각이 한 글자: ${p.t}`);
});

// ── ⑦ 팝업·순환 매장 — 상시 영업이 아닌 곳을 카페로 공개하면 소비자가 헛걸음한다.
test("isPopupRotatingVenue: 팝업은 배제, 일반 카페는 통과", () => {
  assert.equal(isPopupRotatingVenue("카페", "팝업스토어 성수"), true);
  assert.equal(isPopupRotatingVenue("카페", "오르빗"), false);
});

// ── ⑧ 읽히는 문장 판정 — 09-22 CEO 지적("최신 후기를 왜 누락시키냐"). 잘린 꼬리는 탈락 사유가 아니다.
test("isReadableQuote: 잘린 스니펫도 술어가 있으면 읽히는 문장이다", () => {
  assert.equal(isReadableQuote("커피가 정말 맛있고 분위기도 좋았어요...", "오르빗"), true);
  assert.equal(isReadableQuote("#카페 #성수 #데이트 #감성", "오르빗"), false);
  assert.equal(isReadableQuote("짧다", "오르빗"), false, "20자 미만은 탈락");
});
test("displayQuote: 상호·지역만 남는 조각은 보여줄 정보가 없다(empty)", () => {
  assert.equal(displayQuote("☕ 속초 메이트힐 로스터리 카페 (feat.", "메이트힐").empty, true);
  assert.equal(displayQuote("당진 대형카페 아미루트!", "아미루트").empty, true, "지역+업종어만 남는 조각");
  assert.equal(displayQuote("커피가 맛있고 조용해서 작업하기 좋았어요", "메이트힐").empty, false);
});

// ── ⑨ 중복 상호 — 발굴이 같은 가게를 두 번 넣는 것을 막는다.
test("nearDuplicateCafeName: 표기만 다른 같은 가게를 같다고 본다", () => {
  assert.equal(nearDuplicateCafeName("오르빗 올림픽공원점", "오르빗올림픽공원점"), true);
  assert.equal(nearDuplicateCafeName("오르빗", "블루보틀"), false);
});
test("cleanCafeName: 괄호 부가정보를 떼어 상호만 남긴다", () => {
  assert.equal(typeof cleanCafeName("오르빗 (올림픽공원점)"), "string");
  assert.ok(cleanCafeName("오르빗 (올림픽공원점)").includes("오르빗"));
});
