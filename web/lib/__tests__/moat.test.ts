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
import { readFileSync } from "node:fs";
import {
  nameCoherence, brandTokenOverlap, coreTokens, nearDuplicateCafeName,
  detectCampaignCluster, isPopupRotatingVenue, cleanCafeName, verifyReview,
  quoteMatchConfidence, isNonCafeFnbCategory, isNonFnbCategory, isNonCafeFamilySignal,
  coreTokensDetail, addrKeys, isNonBranchWord, nonCoffeeCafeCategoryWords,
} from "../reviewQuality";
import { isOtherBusinessQuote, isReadableQuote, isSentenceQuote, displayQuote, splitKeyTerms } from "../cafeDetailView";
import { sortReviews, ensureRecent } from "../exposureOrder";
import { collectAndSynthesize } from "../collectOrchestrator";
import { mergeRawEvidence, shouldBlockShrink } from "../evidenceMerge";
import { overUnpubCapForTest } from "../synthStore";
import { effectVerdictFor } from "../runLedger";
import { getContract, ALL_CONTRACT_IDS } from "../jobContract";
import { STAGES } from "../pipelineStages";
import { extractHighlights, extractCautions, reviewAge, tasteVector, tasteSimilarity, cardFacets } from "../cafeProfile";
import { synthesize } from "../synthEngine";

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

// ── ⑩ 노출 순서 — 등급이 최우선, 가독성은 **등급 안에서만** 순서를 바꾼다.
//   09-22 사고: 가독성이 등급보다 위에 있어 최신 검증 후기가 제목 조각이라는 이유로 화면에서 사라졌다.
//   10-18 복원: 등급 아래(광고템플릿·캠페인과 같은 자리)로 되돌려 둘을 같이 만족시켰다.
//   실측 효과(표본 150곳·화면 3칸): 제목 조각 297개 → 31개(-89%), 최신 검증이 안 보이는 카페 0곳 유지.
test("sortReviews: 참고 등급의 본문 후기가 검증 등급을 앞지르지 않는다", () => {
  const rows = [
    { quote: "강남 카페 온다", trust: "verified", date: "2026.01.01", score: 90 },            // 제목 조각 + 검증
    { quote: "커피가 산미 있고 좌석도 편해서 오래 앉아 있었어요", trust: "reference", date: "2026.02.01", score: 90 }, // 본문 + 참고
  ];
  const [first] = sortReviews(rows, "온다", ["서울", "강남구"], Date.now());
  assert.equal(first.trust, "verified", "가독성이 등급을 넘어서면 09-22 사고가 재발한다");
});
test("sortReviews: 같은 등급·같은 날짜면 본문 후기가 제목 조각보다 앞선다", () => {
  const rows = [
    { quote: "강남 카페 온다", trust: "verified", date: "2026.03.01", score: 90 },
    // ⚠️ 두 글 모두 상호를 담아야 한다 — 확신도(conf)가 등급보다 먼저 갈리므로, 상호 없는 글은
    //   가독성과 무관하게 뒤로 간다(이 규칙이 교차오염 1차 방어다).
    { quote: "온다 라떼가 부드럽고 창가 자리가 넓어서 작업하기 좋았어요", trust: "verified", date: "2026.03.01", score: 90 },
  ];
  const [first] = sortReviews(rows, "온다", ["서울", "강남구"], Date.now());
  assert.ok(isReadableQuote(first.quote, "온다"), `본문이 먼저여야 한다: ${first.quote}`);
});
// ── ⑪ 최신 예약석 — 화면이 3칸이면 예약석도 3칸 안에 있어야 한다(08-29 "메이트힐이 아직도 2023년 글만").
test("ensureRecent(n=3): 상위 3칸 안에 최근 1년 검증 후기를 한 자리 보장한다", () => {
  const old = (i: number) => ({ quote: `오래된 후기 ${i}`, trust: "verified", date: "2023.01.0" + ((i % 9) + 1) });
  const rows = [old(1), old(2), old(3), old(4), { quote: "최근 방문했어요", trust: "verified", date: "2026.09.01" }];
  const top3 = ensureRecent(rows, 3).slice(0, 3);
  assert.ok(top3.some((e) => e.date?.startsWith("2026")), "최근 1년 검증 후기가 3칸 안에 없다");
  // n=6(기본)이면 예약석이 화면 밖(6번째)에 생겨 사용자는 옛 글만 본다 — 이게 10-18에 고친 것.
  assert.equal(ensureRecent(rows, 3).length, rows.length, "후기가 사라지지 않는다(순서만 바뀐다)");
});

// ── ⑫ '문장' 보조키 — isReadableQuote가 '추천·맛있' 같은 명사를 술어로 세는 느슨함을 보완한다.
//   10-18에 내가 "본문 91.6%"로 보고했는데 엄격히 재니 48.2%였다 — 지표가 느슨해서 과장된 숫자였다.
//   렌더 판정(isReadableQuote)은 09-22 결정 때문에 조이지 않고, **정렬용 키**를 따로 둔다.
test("isSentenceQuote: 제목은 '추천'이 있어도 문장이 아니다", () => {
  assert.equal(isSentenceQuote("[당진] 신상카페 아미루트, 분위기 좋은 대형카페 추천(수유실 완비)"), false);
  assert.equal(isSentenceQuote("당진 대형카페 아미루트 베이커리"), false);
  assert.equal(isSentenceQuote("가족들과 방문했는데 빵이 정말 맛있었어요"), true);
  assert.equal(isSentenceQuote("제가 주문한 라떼는 산미가 적었습니다"), true);
});
test("sortReviews: 같은 등급·같은 날짜면 '문장'이 제목보다 앞선다", () => {
  const rows = [
    { quote: "[당진] 신상카페 온다, 분위기 좋은 대형카페 추천(수유실 완비)", trust: "verified", date: "2026.03.01", score: 90 },
    { quote: "온다 창가 자리에 앉아 라떼를 마셨는데 산미가 적어 좋았어요", trust: "verified", date: "2026.03.01", score: 90 },
  ];
  const [first] = sortReviews(rows, "온다", ["서울", "강남구"], Date.now());
  assert.ok(isSentenceQuote(first.quote), `문장이 먼저여야 한다: ${first.quote}`);
});

// ── ⑬ 🔑 해자 불변식: **판정은 카페 상호에 어떤 낱말이 들어있는지와 무관해야 한다.**
//   2026-10-18 실측으로 드러난 결함 클래스 — 게이트들이 "카페 실질맥락이 전무하면 거절" 구조인데,
//   그 맥락 검사를 **상호가 포함된 문자열**에 해서, 상호에 '커피/카페'가 들어간 카페(공개 48,745곳 중
//   **14,633곳 = 30.0%**)에서 게이트가 통째로 무력화됐다. decisions#1158이 하드거절 7종만 고치고
//   라이브카페·네이버카페링크·관광지·ctxGate 네 곳이 누락돼 있었다.
//   실측 전/후: 카페 내용 0인 글이 상호 "아르테"→rejected/20, "아르테커피"→**verified/74** 였다.
//   이 테스트는 그 비대칭이 어디서든 되살아나면 즉시 깨진다.
const NAME_PAIRS: [string, string][] = [["아르테", "아르테커피"], ["야누스", "야누스베이커리"], ["루미나", "루미나디저트"]];
function verdictFor(name: string, extra: Record<string, unknown>) {
  return verifyReview({ name, areaTerms: ["서울", "강남구"], source: "blog", body: "", ...extra } as any).verdict;
}
test("상호에 카페 낱말이 있어도 '카페 내용 전무' 판정은 같다", () => {
  for (const [plain, withWord] of NAME_PAIRS) {
    // 카페 내용이 전혀 없는 글(주차장·사람 많음·날씨)
    const mk = (n: string) => ({ title: `${n} 다녀왔어요`, body: `${n}에 갔어요. 주차장이 넓고 사람이 많았습니다. 날씨가 좋았어요.` });
    assert.equal(verdictFor(plain, mk(plain)), verdictFor(withWord, mk(withWord)),
      `상호에 카페 낱말이 있다는 이유만으로 판정이 달라졌다: ${plain} vs ${withWord}`);
  }
});
test("라이브카페 주류·공연 캡은 상호와 무관하게 적용된다", () => {
  const mk = (n: string) => ({ naverCategory: "라이브카페", title: `${n} 방문`,
    body: `${n}에서 하이볼과 위스키 마시며 재즈 공연 봤어요. 커버차지 있어요.` });
  for (const [plain, withWord] of NAME_PAIRS) {
    assert.equal(verdictFor(plain, mk(plain)), verdictFor(withWord, mk(withWord)), `${plain} vs ${withWord}`);
  }
});
test("진짜 카페 내용이 있으면 그대로 검증된다(과잉 거절 방지)", () => {
  const r = verifyReview({ name: "아르테커피", areaTerms: ["서울", "강남구"], source: "blog",
    title: "아르테커피 다녀왔어요",
    body: "아르테커피에서 아메리카노와 소금빵을 주문했어요. 원두가 산미 있고 좌석도 넓어서 오래 앉아 있었습니다." });
  assert.equal(r.verdict, "verified");
});
// 🍰 어휘 보강 회귀 — 상호명을 빼고 검사하게 되면서 사전 누락이 곧 오탐이 된다. 실측 빈도순 상위를 못으로 박는다.
test("음료·디저트 어휘가 카페 실질맥락으로 인정된다", () => {
  for (const w of ["소금빵", "팥빙수", "쿠키", "말차", "휘낭시에", "크로플", "스페셜티"]) {
    const r = verifyReview({ name: "아르테커피", areaTerms: ["서울", "강남구"], source: "blog",
      title: "아르테커피 다녀왔어요", body: `아르테커피에서 ${w} 먹었어요. 자리가 넓고 좋았습니다.` });
    assert.notEqual(r.verdict, "rejected", `'${w}'가 카페 내용으로 인정되지 않는다`);
  }
});
// ⚠️ 식사 메뉴는 일부러 실질맥락에서 제외했다 — 식당·분식 게이트가 `!CAFE_CONTEXT_SUBSTANCE` 구조라,
//   이걸 인정하면 그 방어가 약해진다. 이 선택이 뒤집히면 테스트가 알려준다.
test("식사 메뉴(샌드위치·파스타)는 카페 실질맥락으로 인정하지 않는다", () => {
  const r = verifyReview({ name: "아르테", areaTerms: ["서울", "강남구"], source: "blog",
    title: "아르테 미용실", body: "아르테 미용실에서 머리하고 네일샵 갔어요. 파스타랑 샌드위치도 먹었습니다. 필라테스도 했어요." });
  assert.equal(r.verdict, "rejected");
});

// ═══ 등급 산정(collectOrchestrator) — 해자의 마지막 미보호 구간. 2026-10-18 신설 ═══
//   09-13 해자 감사로 들어간 네 규칙이 **테스트 없이** 돌고 있었다. 이 규칙이 조용히 풀리면
//   사업자 계정 30건이 그것만으로 '검증'을 만들던 구멍이 되살아난다.
//   표시 수(trustCount)와 등급 근거(gradeCount)는 **분리**돼 있다 — 표시는 줄지 않고 등급만 엄격해진다.
const AREA2 = ["서울", "강남구"];
const CAFE = "리플렉트랩";
const review = (i: number, acct: string, date: string, title?: string) => ({
  title: title ?? `${CAFE} 다녀왔어요 ${i}`,
  text: `${CAFE}에서 아메리카노와 소금빵을 주문했어요. 원두가 산미 있고 좌석이 넓어 좋았습니다. ${i}`,
  link: `https://blog.naver.com/${acct}/${1000 + i}`,
  date, source: "blog", srcName: `블로거${acct}`,
});
const judge = (texts: any[]) => collectAndSynthesize(CAFE, AREA2, [{ source: "blog", texts }]);
const NOW = "2026.09.01", OLD3Y = "2021.01.01";

test("등급: 서로 다른 계정 35건이면 '검증'(문턱 30)", () => {
  const r = judge(Array.from({ length: 35 }, (_, i) => review(i, `acct${i}`, NOW)));
  assert.equal(r.grade, "검증");
  assert.equal(r.collected, 35);
});
test("등급: 같은 계정 35건은 '검증'이 되지 않는다(계정당 2건 상한)", () => {
  const r = judge(Array.from({ length: 35 }, (_, i) => review(i, "sameacct", NOW)));
  assert.notEqual(r.grade, "검증", "사업자 계정 한 개로 검증을 만들 수 있으면 해자가 뚫린다");
  assert.equal(r.collected, 35, "표시 수는 줄지 않는다(등급 근거만 엄격)");
  assert.equal(r.quality?.gradeExcluded?.accountCap, 33, "2건만 인정하고 33건을 등급에서 뺀다");
});
test("등급: 3년 넘은 글은 등급 근거 0.5 가중", () => {
  const a = judge(Array.from({ length: 35 }, (_, i) => review(i, `acct${i}`, OLD3Y)));
  assert.notEqual(a.grade, "검증", "35×0.5=17.5 < 30");
  assert.equal(a.quality?.gradeExcluded?.oldHalf, 35);
  const b = judge(Array.from({ length: 70 }, (_, i) => review(i, `acct${i}`, OLD3Y)));
  assert.equal(b.grade, "검증", "70×0.5=35 ≥ 30");
});
// 🚪 폐업 신호 — cron-closure(route.ts:75)가 **rejectReasons의 이 문자열**로 재확인한다.
//   문자열이 바뀌면 크론이 조용히 신호를 못 받는다(설명과 규칙이 갈라지는 자리). 못으로 박는다.
test("폐업 언급 글은 노출에서 빠지고 rejectReasons에 신호를 남긴다", () => {
  const r = judge([
    ...Array.from({ length: 5 }, (_, i) => review(i, `ok${i}`, NOW)),
    { title: `${CAFE} 폐업했대요`, text: `${CAFE} 아메리카노 좋았는데 지금은 문을 닫았다고 합니다.`,
      link: "https://blog.naver.com/clo1/1", date: NOW, source: "blog" },
  ]);
  assert.equal(r.collected, 5, "폐업 언급 글은 표시에서 제외된다");
  assert.ok(r.quality?.rejectReasons?.["폐업 언급 — 노출 제외(폐업 확인 대상)"],
    "cron-closure가 읽는 신호 문자열이 사라졌다 — route.ts:75와 함께 고쳐야 한다");
});
// 👤 사장님·공식 계정 — ⚠️ 실제 파이프라인은 **블로거명을 snippet.source에** 담는다
//   (lib/webSearchCollector.ts:73 → collectOrchestrator가 `srcName: t.source`로 넘긴다).
//   `srcName`을 snippet에 직접 넣으면 아무 일도 일어나지 않는다 — 내가 처음 이 테스트를 그렇게 써서
//   "탐지 실패"로 오판했다(2026-10-18). 필드를 틀리면 조용히 통과하므로 여기 적어 둔다.
test("사장님·공식 계정 글은 제외된다(한글 상호·영문 핸들 모두)", () => {
  const withBlogger = (blogger: string, handles?: string[]) => {
    const texts = [
      ...Array.from({ length: 5 }, (_, i) => ({ ...review(i, `ok${i}`, NOW), source: `블로거${i}` })),
      { ...review(99, "owner", NOW), source: blogger },
    ];
    return collectAndSynthesize(CAFE, AREA2, [{ source: "blog", texts } as any],
      handles ? { selfHandles: handles } : undefined);
  };
  for (const [blogger, handles] of [[`${CAFE} 공식`, undefined], [CAFE, undefined], ["reflectlab", ["reflectlab"]]] as [string, string[] | undefined][]) {
    const r = withBlogger(blogger, handles);
    assert.equal(r.collected, 5, `자기 홍보 글이 통과했다(블로거명 "${blogger}") — '광고도 아닌 진짜 후기' 약속이 깨진다`);
    assert.ok(r.quality?.rejectReasons?.["사장님·공식 계정 글 — 자기 홍보 제외"]);
  }
  // 대조군 — 일반 블로거는 그대로 통과해야 한다(과잉 제외 방지).
  assert.equal(withBlogger("그냥블로거").collected, 6);
});

// ═══ 근거 보존(evidenceMerge) — 10-17 내가 실제로 데이터를 날린 자리. 2026-10-18 신설 ═══
//   그날 재수집이 누적 원본을 **덮어써서** 공개 카페 2곳의 검증 후기가 171→36 · 100→68로 깎였다(복구 불가).
//   합치기와 급감 차단기로 막았지만 둘 다 테스트가 없었다 — 서비스 최대 자산을 지키는 코드가 무방비였다.
const ev = (link: string, date?: string, text = "본문") =>
  ({ source: "blog" as const, text, title: `제목 ${link}`, link, date });

test("합치기: 새 수집이 기존 근거를 덮어쓰지 않는다(10-17 사고 재발 방지)", () => {
  // 그날의 모양 — 기존 171건, 재수집은 36건만 돌려줬다.
  const prev = Array.from({ length: 171 }, (_, i) => ev(`p${i}`, "2025.01.01"));
  const fetched = Array.from({ length: 36 }, (_, i) => ev(`f${i}`, "2026.09.01"));
  const merged = mergeRawEvidence(prev, fetched, 600);
  assert.equal(merged.length, 207, "합집합이어야 한다 — 덮어쓰면 171건이 36건으로 깎인다");
  for (const p of prev) assert.ok(merged.some((m) => m.link === p.link), `기존 근거가 사라졌다: ${p.link}`);
});
test("합치기: 같은 글(링크 동일)은 새 판본이 이기고 개수는 늘지 않는다", () => {
  const merged = mergeRawEvidence([ev("a", "2025.01.01", "낡은 본문")], [ev("a", "2026.09.01", "새 본문")], 600);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, "새 본문");
});
test("합치기: 링크가 없으면 출처+제목+본문으로 중복을 제거한다", () => {
  const a = { source: "blog" as const, text: "같은 본문입니다", title: "같은 제목", date: "2026.01.01" };
  assert.equal(mergeRawEvidence([a], [{ ...a }], 600).length, 1);
});
test("합치기: 상한을 넘으면 **오래된 것부터** 잘린다(최신은 반드시 남는다)", () => {
  const old = Array.from({ length: 5 }, (_, i) => ev(`old${i}`, "2020.01.01"));
  const fresh = Array.from({ length: 5 }, (_, i) => ev(`new${i}`, "2026.09.01"));
  const merged = mergeRawEvidence(old, fresh, 5);
  assert.equal(merged.length, 5);
  for (const f of fresh) assert.ok(merged.some((m) => m.link === f.link), `최신 근거가 잘렸다: ${f.link}`);
});
test("합치기: 날짜 없는 항목은 맨 뒤로 가 상한에서 먼저 잘린다", () => {
  const dated = Array.from({ length: 3 }, (_, i) => ev(`d${i}`, "2026.09.01"));
  const undated = Array.from({ length: 3 }, (_, i) => ev(`u${i}`));
  const merged = mergeRawEvidence(undated, dated, 3);
  for (const d of dated) assert.ok(merged.some((m) => m.link === d.link), "날짜 있는 근거가 밀려났다");
});
test("합치기: 기존이 없으면 새 수집을 그대로 쓴다", () => {
  const f = [ev("x", "2026.01.01")];
  assert.deepEqual(mergeRawEvidence([], f, 600), f);
});

// 🛡️ 급감 차단기 — 10-17 사고의 **진짜 구멍**은 "줄어드는 쓰기를 거부하는 관문이 없었다"는 것.
//   어떤 경로(깊은 수집·재합성·규칙 변경)로 들어와도 공개 카페 근거가 한 번에 꺾이면 멈춰야 한다.
const G = { minCount: 10, ratio: 0.8 };
test("급감 차단: 공개 카페가 171 → 36건이면 쓰기를 막는다", () => {
  assert.equal(shouldBlockShrink({ wasPublished: true, prevCount: 171, newCount: 36, ...G }), true);
});
test("급감 차단: 20% 이내 자연 감소는 통과시킨다(과잉 차단 방지)", () => {
  assert.equal(shouldBlockShrink({ wasPublished: true, prevCount: 100, newCount: 85, ...G }), false);
  assert.equal(shouldBlockShrink({ wasPublished: true, prevCount: 100, newCount: 79, ...G }), true, "80% 미만은 막는다");
});
test("급감 차단: 미공개·근거 적은 카페는 대상이 아니다(수집을 멈추지 않는다)", () => {
  assert.equal(shouldBlockShrink({ wasPublished: false, prevCount: 171, newCount: 1, ...G }), false, "미공개는 자연 변동이 크다");
  assert.equal(shouldBlockShrink({ wasPublished: true, prevCount: 9, newCount: 0, ...G }), false, "10건 미만은 대상 밖");
});
test("급감 차단: 증가하는 쓰기는 당연히 통과한다", () => {
  assert.equal(shouldBlockShrink({ wasPublished: true, prevCount: 50, newCount: 90, ...G }), false);
});

// ── ⑭ 🛑 대량 비공개 차단기 — 소비자 손상(공개 카페가 한꺼번에 사라짐)을 막는 마지막 관문.
//   2026-10-18 실측: 상한이 리뷰기반 힐러 3곳에만 있었고 `holdZeroEvidenceSuspects`·
//   `healNonCafeCategory`(상호 정규식 포함)·`healOutOfBox`(criteria geo.box 의존)는 **무제한**이었다.
//   평시 대상 모집단이 0곳이라 상한은 정상 운영을 막지 못하고, 회귀 때만 48,745곳 전체 노출을 멈춘다.
test("대량 비공개 차단: 상한(50)을 기준으로 판정한다", () => {
  assert.equal(overUnpubCapForTest(0), false, "평시 0건은 통과해야 한다");
  assert.equal(overUnpubCapForTest(50), false, "상한까지는 집행한다");
  assert.equal(overUnpubCapForTest(51), true, "상한을 넘으면 멈춘다");
  assert.equal(overUnpubCapForTest(48745), true, "회귀로 전량이 걸리면 반드시 멈춘다");
});

// ═══ 하네스 1원칙 — "실행이 아니라 **효과**가 성공" (2026-10-18 신설) ═══
//   🔴 그때까지 `run_ledger.effect_ok`는 최근 30일 **2,372건 전부 NULL**이었다.
//   `recordLedger`가 인자로 받긴 했지만 **넘기는 호출자가 하나도 없었고**, `jobContract`의
//   `effect: {kind:"monotone-decrease"}` 선언도 **읽는 코드가 없었다** — 하네스의 1원칙이
//   한 번도 실행된 적이 없었다는 뜻이다. 10-17에 내가 계약에 선언 5개를 추가한 것도 빈껍데기였다.
//   과거 30일 역검증: 이 판정이 `cron-embed`의 정체 **8건**을 잡는다(내가 며칠 놓쳤던 "0건 처리·5,611건 남음").
const P = (updated: number, remain: number, ok: boolean | null = true) => ({ ok, updated, remain });
test("효과 판정: 처리 0건이고 남은 일이 있어도 첫 회차는 판정하지 않는다", () => {
  assert.equal(effectVerdictFor({ updated: 0, remain: 100 }, [], 2), true, "비교할 과거가 없으면 효과 없음으로 몰지 않는다");
});
test("효과 판정: 2회 연속 '처리 0 + 남은 일 있음'이면 효과 없음", () => {
  assert.equal(effectVerdictFor({ updated: 0, remain: 5611 }, [P(0, 5611)], 2), false);
});
test("효과 판정: 진척이 있었던 런이 끼면 연속이 아니다", () => {
  assert.equal(effectVerdictFor({ updated: 0, remain: 100 }, [P(50, 100)], 2), true);
});
test("효과 판정: 할 일이 없어서 0건인 것은 성공이다(오탐 방지)", () => {
  assert.equal(effectVerdictFor({ updated: 0, remain: 0 }, [P(0, 0)], 2), true, "큐가 비면 0건이 정상이다");
});
test("효과 판정: 계량이 없으면 판정하지 않는다(NULL)", () => {
  assert.equal(effectVerdictFor({ processed: 0 }, [P(0, 10)], 2), null, "remain이 없으면 '막힘'과 '할 일 없음'을 구분할 수 없다");
  assert.equal(effectVerdictFor(undefined, [], 2), null);
});
test("효과 판정: 이미 실패로 보고된 런은 효과로 또 판정하지 않는다", () => {
  assert.equal(effectVerdictFor({ updated: 0, remain: 10 }, [P(0, 10)], 2, false), null);
});
test("효과 판정: 사이에 실패가 끼면 연속으로 보지 않는다", () => {
  assert.equal(effectVerdictFor({ updated: 0, remain: 10 }, [P(0, 10, false)], 2), true);
});

// ── ⑮ 계약 선언이 **잡의 성질과 맞는지** 고정 (2026-10-18)
//   10-17에 내가 effect 선언 5개를 한꺼번에 붙였는데 3개가 잡의 성질과 맞지 않았다:
//     cron-resynth        4일 주기 **전수 순환** — 남은 일이 계속 재생성되므로 '줄어들어야 한다'가 성립 안 함
//     cron-issues         열린 이슈는 **CEO 결재**에 달려 있음 — 결재 대기 중 안 줄어드는 건 정상
//     cron-coord-consumer 롤아웃 1단계 **드라이런**(집행 0) — 의도적으로 큐를 줄이지 않는 상태
//   틀린 선언을 두면 **영구 거짓 경보**가 되고 그게 진짜 문제를 묻는다(빨강 규칙). 그래서 철회했다.
//   이 테스트는 누가 다시 붙이면 깨진다 — 붙이려면 그 잡이 정말 '자기 힘으로 백로그를 줄이는 잡'인지 먼저 따져야 한다.
test("계약: monotone-decrease는 '자기 힘으로 백로그를 줄이는 잡'만", () => {
  const declared = ALL_CONTRACT_IDS.filter((j) => getContract(j).effect?.kind === "monotone-decrease").sort();
  assert.deepEqual(declared, ["cron-embed", "cron-sentinel", "cron-synth"],
    "effect 선언이 바뀌었다 — 잡의 성질을 따져보고 주석에 근거를 남긴 뒤 이 목록을 갱신할 것");
});
test("계약: 구현되지 않은 effect 종류를 선언하지 않는다", () => {
  const IMPLEMENTED = new Set(["monotone-decrease", "idempotent", "none"]);
  for (const j of ALL_CONTRACT_IDS) {
    const k = getContract(j).effect?.kind;
    assert.ok(!k || IMPLEMENTED.has(k), `${j}: 구현 없는 effect 종류 "${k}" — 선언만 하면 빈껍데기가 된다`);
  }
});

// ── ⑯ 🪜 파이프라인 단계 모델 — "체계적으로 구조화된 파이프라인"의 뼈대. (2026-10-18)
//   실측: 계량을 남긴 잡 **42종 중 '남은 일'을 보고하는 건 2종**뿐이었다. 그래서
//   "할 일이 없어서 0건"과 "막혀서 0건"을 구분할 수 없었다 — 12일 무경보 사고의 구조적 원인.
//   단계 정의를 `lib/pipelineStages.ts` 한 곳에 모았다(34개 라우트에 흩어 놓으면 '부분 적용' 병이 재발한다).
//   🔑 철칙: 단계의 적체 정의는 **그 단계를 전진시키는 잡의 큐 정의와 같아야 한다.**
//      이 모델을 만들면서 내 정의가 3번 틀렸고 전부 잡과 대조해 잡았다:
//        ④ 임베딩  `embedding IS NULL`만 셈 → 149곳 (잡은 '낡은 임베딩'까지 세어 9,056곳)
//        ⑤ 순환    `synth_updated` 사용 → 11,858곳 (순환 기준은 `synth_checked_at`, 실제 4,258곳)
//        날짜      JS `toISOString()`이 KST를 UTC로 되돌려 머리글이 하루 밀렸다
test("파이프라인 단계 모델: 단계마다 소유 잡과 적체 정의가 있다", () => {
  assert.ok(STAGES.length >= 7, "단계가 줄었다 — 파이프라인 모델이 흐려지면 어디가 막혔는지 모른다");
  for (const s of STAGES) {
    assert.ok(s.id && s.id.length > 1, "단계 이름이 없다");
    assert.ok(s.owner && s.owner.length > 1, `${s.id}: 적체가 쌓일 때 **누가 전진시키는지**가 없다`);
    assert.ok(s.note && s.note.length > 5, `${s.id}: 무엇이 '남은 일'인지 설명이 없다`);
    assert.equal(typeof s.backlog, "function", `${s.id}: 적체 측정이 없다`);
  }
});
test("파이프라인 단계 모델: 순환 단계는 명시된다(0이 목표가 아니다)", () => {
  const cyclic = STAGES.filter((s) => s.cyclic).map((s) => s.id);
  assert.ok(cyclic.length >= 1, "순환 단계 표시가 사라졌다 — 재합성처럼 0이 될 수 없는 단계를 '막힘'으로 오판한다");
});

// ── ⑰ 🔓 보류에서 나오는 길 — "들어가는 문만 있는 방"을 막는다. (2026-10-18)
//   실측: 보류 7,836곳 중 해제 레인이 지금 풀 수 있는 곳이 **0곳**이었다.
//     · `holdZeroEvidenceSuspects`의 해제 조건은 새 그라운딩 판정(grounded=true)을 요구하는데,
//       그라운딩은 **공개 카페만** 본다 → 보류되면 재검 자체가 안 된다(영구 교착).
//       (보류 7,836곳의 판정 신선도: 없음 7,474 · 낡음 362 · **유효 0**)
//     · `finalizePipeline`의 해제 레인은 `exclude_reason = ''`(사유 비어 있어야 함)인데,
//       09-16·17 소급 정정이 사유를 적어 넣었다: "수집 근거 0건 — **held 재평가 대기**".
//       문구가 재평가를 약속하는데 재평가 레인이 그 사유를 건너뛴다.
//   09-24 주석이 이미 같은 구멍("그 대기열이 없었다")을 적어뒀는데 **문구만 바뀌어 되살아났다.**
//   이 테스트는 그 사유가 해제 후보에서 다시 빠지면 깨진다.
function laneSrc(src: string): string {
  const a = src.indexOf("🔓 held 해제 레인");
  const b = src.indexOf("해제 실패가 승격을 막지 않는다", a);
  assert.ok(a >= 0 && b > a, "해제 레인 구간을 찾지 못했다 — 앵커 문구가 바뀌었다면 이 테스트부터 고칠 것");
  return src.slice(a, b);
}
test("보류 해제: '재평가 대기' 사유는 해제 후보에 포함된다", () => {
  const src = readFileSync(new URL("../synthStore.ts", import.meta.url), "utf8");
  // ⚠️ 끝 앵커는 **이 레인 안에서만 나오는 문구**여야 한다 — 처음엔 `await loadCriteria(); // 수도권 좌표박스`를
  //   썼다가 그 문구가 파일 앞쪽(healOutOfBox)에 먼저 나와 잘라낸 구간이 빈 문자열이 됐고 테스트가 거짓 실패했다.
  const lane = laneSrc(src);
  assert.ok(lane.includes("재평가 대기%"),
    "'수집 근거 0건 … 재평가 대기' 사유가 해제 후보에서 빠졌다 — 그러면 보류에서 나오는 길이 다시 막힌다");
  // 가드가 함께 남아 있어야 한다 — 사유만 넓히고 가드를 빼면 프랜차이즈·비카페가 공개된다.
  for (const guard of ["synth_coherence", "offctx_rate", "naver_category", "audit_flags",
                       "isFranchise", "isNonCafe", "isSnackStall", "isStructuralPhantom", "isUnmannedCafe"]) {
    assert.ok(lane.includes(guard), `해제 레인에서 가드 ${guard}가 사라졌다 — 비카페·프랜차이즈가 공개된다`);
  }
  assert.ok(/slice\(0,\s*200\)/.test(lane), "1회 200곳 상한이 사라졌다 — 대량 공개 변동 위험");
});
test("보류 해제: 판정 결과(규칙 위반·오염) 사유는 포함하지 않는다", () => {
  const src = readFileSync(new URL("../synthStore.ts", import.meta.url), "utf8");
  const lane = laneSrc(src);
  assert.ok(!lane.includes("규칙 위반%"), "'규칙 위반(프랜차이즈·비카페)'은 재평가 대기가 아니라 판정 결과다 — 풀면 안 된다");
  assert.ok(!lane.includes("오염%"), "'오염' 사유는 판정 결과다 — 풀면 안 된다");
});

// ═══ ⑱ 무방비였던 판정 함수 8개 — 2026-10-18 전수 보강 ═══
//   판정 함수 19개 중 11개만 테스트가 있었다. 남은 8개를 **각 함수 주석에 적힌 실제 사고 사례**로 덮는다.
//   이 함수들이 조용히 풀리면 옆가게·식당·교육업체 글이 '검증 후기'로 화면에 올라간다.

// 🎯 인용문 하나의 확신도 — nameCoherence(집계용)보다 엄격해야 한다(#307).
//   흔한 낱말 상호('여유')가 한 번 스친 것만으로 상위에 올라가면 동명 카페 글이 섞인다.
test("quoteMatchConfidence: 흔한 낱말 상호는 전체 이름 원문 일치를 요구한다", () => {
  const A = ["서울", "강남구", "역삼동"];
  assert.equal(quoteMatchConfidence("여유", "여유롭게 쉬다 왔어요", A), 0, "'여유'가 부사로 스친 것은 근거가 아니다");
  assert.ok(quoteMatchConfidence("여유", "카페 여유 다녀왔어요 커피 좋아요", A) > 0.9, "전체 이름이 원문으로 있으면 인정");
  assert.ok(quoteMatchConfidence("리플렉트랩", "리플렉트랩 다녀왔어요", A) > 0.9);
  assert.equal(quoteMatchConfidence("리플렉트랩", "오늘 날씨가 좋네요", A), 0);
});

// 🍝 F&B지만 카페가 아닌 식당 — 상호에 '카페'가 들어가도 카테고리가 순수 식당이면 대상이다
//   (실사고: 카페나하본점·파스타인카페·루비스한남점). 이름만으론 카페가 아니다.
test("isNonCafeFnbCategory: 순수 식당 업종은 카페가 아니다", () => {
  for (const c of ["음식점>한식", "음식점>이탈리아음식", "음식점>일식>초밥,롤"]) {
    assert.equal(isNonCafeFnbCategory(c), true, `${c}가 카페로 통과하면 식당 후기가 섞인다`);
  }
  for (const c of ["음식점>카페,디저트", "카페,디저트>카페"]) {
    assert.equal(isNonCafeFnbCategory(c), false, `${c}는 카페다 — 걸러내면 정상 카페가 죽는다`);
  }
  assert.equal(isNonCafeFnbCategory(""), false, "카테고리 없음 ≠ 비카페(누락을 판정으로 쓰지 않는다)");
});

// 🏭 F&B 대분류가 아닌 업종 — 상호가 '○○로스터스'인 **바리스타 교육업체**가 카페 맥락 가드를 무력화했다.
test("isNonFnbCategory: F&B가 아닌 업종을 가린다", () => {
  for (const c of ["직업기술교육>바리스타", "제조업>떡류제조", "서비스,산업>통신"]) {
    assert.equal(isNonFnbCategory(c), true, `${c}는 F&B가 아니다`);
  }
  assert.equal(isNonFnbCategory("음식점>카페,디저트"), false);
  assert.equal(isNonFnbCategory("제조업>커피가공"), false, "커피가공은 정상 로스터리 겸영이다 — 걸러내면 오탐");
  assert.equal(isNonFnbCategory(""), false);
});

// 🚩 임의 업종 + 상호에 카페어 없음 = LLM 그라운딩 **우선순위 신호**(자동 비공개가 아니다 — 오탐 위험).
test("isNonCafeFamilySignal: 상호에 카페어가 있으면 신호를 끈다", () => {
  assert.equal(isNonCafeFamilySignal("서비스,산업>통신", "온다"), true);
  assert.equal(isNonCafeFamilySignal("서비스,산업>통신", "온다커피"), false, "상호에 카페어가 있으면 정상 카페 가능성");
  assert.equal(isNonCafeFamilySignal("음식점>카페,디저트", "온다"), false);
});

// 🏢 식별 토큰 — 몰·신도시명을 떼고 브랜드만 남긴다. 남은 게 전부 건물·기관명이면 venueOnly(앵커 부족).
test("coreTokensDetail: 몰·지역명을 떼고 브랜드만 남긴다", () => {
  const a = coreTokensDetail("앤티앤스 스타필드 위례", ["경기", "하남시"]);
  assert.deepEqual(a.tokens, ["앤티앤스"], "몰 이름(스타필드)·신도시(위례)가 식별 토큰에 남으면 옆가게가 통과한다");
  const b = coreTokensDetail("스타벅스 역삼동점", ["서울", "강남구", "역삼동"]);
  assert.deepEqual(b.tokens, ["스타벅스"]);
  const c = coreTokensDetail("미사강변 북카페", ["경기", "하남시"]);
  assert.equal(c.venueOnly, true, "남은 토큰이 지역·건물명뿐이면 지역일치만으로 식별 인정하면 안 된다");
});

// 📍 주소 증거 — **도로명+건물번호**가 후기에 있으면 상호보다 강한 증거다. 동/읍만으로는 인정하지 않는다
//   (같은 동 옆가게가 통과한다).
test("addrKeys: 번지까지 있는 주소만 증거로 쓴다", () => {
  assert.deepEqual(addrKeys("서울 강남구 역삼로 223"), ["역삼로223"]);
  assert.deepEqual(addrKeys("서울 강남구 역삼동"), [], "동만으로는 옆가게와 구분이 안 된다");
  assert.deepEqual(addrKeys(undefined), []);
});

// 🏷️ 지점앵커가 아닌 말 — '제과점'을 지점명으로 오인해 형제지점끼리 근거를 공유한 사고(coordination#225).
//   GENERIC_WORD 사전과 **하나로 합쳤다** — 사전이 둘이면 드리프트로 재발한다.
test("isNonBranchWord: 업종어는 지점앵커가 아니다", () => {
  for (const w of ["제과점", "본점", "로스터리", "커피"]) {
    assert.equal(isNonBranchWord(w), true, `'${w}'를 지점으로 보면 형제지점 근거가 섞인다`);
  }
  for (const w of ["역삼점", "신사점"]) {
    assert.equal(isNonBranchWord(w), false, `'${w}'는 진짜 지점명이다`);
  }
});

// 🎷 카테고리가 업종어를 쓰는 카페(라이브카페·북카페·와인바·펍카페) — 그 업종어를 '카페 어휘'로 인정해야
//   "제목이 다른 카페를 가리킴" 방어가 발동한다(decisions#566, 재즈클럽 야누스 사고).
//   ⚠️ 범위가 좁은 게 설계다 — 스터디·애견카페는 아예 서비스 대상이 아니라 다른 경로가 비공개한다.
test("nonCoffeeCafeCategoryWords: 해당 카테고리일 때만 그 업종어를 인정한다", () => {
  assert.deepEqual(nonCoffeeCafeCategoryWords("카페,디저트>북카페"), ["북카페"]);
  assert.deepEqual(nonCoffeeCafeCategoryWords("카페,디저트>카페"), [], "일반 카페엔 업종어 확장을 적용하지 않는다");
  assert.ok(nonCoffeeCafeCategoryWords("카페,디저트>라이브카페").includes("재즈바"));
});

// ═══ ⑲ 화면에 직접 나가는 계산(cafeProfile) — 2026-10-18 보강 ═══
//   결 축·주의점·시설 배지·근처 카페 유사도는 **소비자가 읽는 숫자**인데 테스트가 0개였다.
//   핵심 규약: **표본이 적으면 판단하지 않는다**(6건 미만 생략 · 9%+ 최소 3건 · 주의점은 2건+).
//   그 문턱이 풀리면 후기 2건짜리 카페에 "조용·차분한"이 단정으로 박힌다.
const QUIET = "조용하고 차분해서 좋았어요 커피도 맛있습니다";
const PARK = "주차가 어려워서 한참 돌았어요";
const rep = (t: string, k: number) => Array(k).fill(t);

test("결 축: 표본 6건 미만이면 판단하지 않는다", () => {
  assert.deepEqual(extractHighlights(rep(QUIET, 5)), [], "5건으로 단정하면 근거가 약하다");
  assert.deepEqual(extractHighlights(rep(QUIET, 6)).map((h) => h.label), ["조용·차분한"]);
});
test("결 축: 9%·최소 3건 문턱", () => {
  const a = extractHighlights([...rep(QUIET, 3), ...rep(PARK, 7)]);
  assert.deepEqual(a.map((h) => h.label), ["조용·차분한"], "10건 중 3건 = 문턱 충족");
  const b = extractHighlights([...rep(QUIET, 2), ...rep(PARK, 8)]);
  assert.deepEqual(b, [], "10건 중 2건은 문턱 미달");
});
test("결 축: 부정 표현은 긍정으로 세지 않는다", () => {
  assert.deepEqual(extractHighlights(rep("조용하지 않고 시끄러웠어요 커피는 괜찮았습니다", 6)), [],
    "'조용하지 않다'를 '조용함'으로 세면 거짓 정보가 화면에 박힌다");
});
test("주의점: 표본 6건 미만 생략 · 2건 이상이면 표면화", () => {
  assert.deepEqual(extractCautions(rep(PARK, 5)), []);
  const c = extractCautions(rep(PARK, 6));
  assert.ok(c.some((x) => x.label === "주차 어려움"));
  assert.ok(c[0].quote && c[0].quote.includes("주차"), "근거 인용에 그 표현이 들어 있어야 한다(09-14 수리)");
});
// 🅿️ 2026-10-18 어휘 보강 회귀 — "주차가 어려워요"는 `주차가 어렵`·`주차 어려` 어디에도 안 걸렸다.
//   ⚠️ 넓게(`"주차가 어려"`) 잡으면 **"주차가 어려움이 없어요"를 주의점으로 오판**한다 —
//      CAUTION_FLIP은 `않/아니`만 보고 `없`은 안 본다. 그래서 **활용형을 정확히** 지정했다.
test("주의점: 조사+활용형을 잡고, 부정 문맥은 잡지 않는다", () => {
  for (const t of ["주차가 어려워요 한참 돌았어요", "주차가 어려웠어요", "주차는 어려워서 아쉬웠어요", "주차가 어렵습니다"]) {
    assert.ok(extractCautions(rep(t, 6)).some((c) => c.label === "주차 어려움"), `놓침: ${t}`);
  }
  for (const t of ["주차가 어려움이 없어요 넓습니다", "주차 편해요 넓습니다"]) {
    assert.ok(!extractCautions(rep(t, 6)).some((c) => c.label === "주차 어려움"), `오탐: ${t}`);
  }
});
test("후기 나이: 18개월이 '오래된 후기' 경계", () => {
  assert.equal(reviewAge("2026.09.01", Date.parse("2026-10-18"))?.old, false);
  assert.equal(reviewAge("2024.01.01", Date.parse("2026-10-18"))?.old, true);
  assert.equal(reviewAge("아무말"), null, "파싱 실패는 null — 추측하지 않는다");
});
test("근처 카페 유사도: 후기 0건이면 결 벡터를 신뢰하지 않는다", () => {
  const none = tasteVector({ quiet: 9 }, 0);
  assert.ok(none.every((v) => v === 0), "후기 0건인데 결이 세면 엉뚱한 카페를 '비슷하다'고 추천한다");
  const a = tasteVector({ quiet: 8, work: 7 }, 50), b = tasteVector({ quiet: 8, work: 7 }, 50);
  assert.equal(tasteSimilarity(a, b), 1);
  assert.equal(tasteSimilarity(a, tasteVector({ dessert: 9 }, 50)), 0);
});
test("카드 배지: 상한 개수만 보여준다", () => {
  const got = cardFacets(["조용·차분한", "작업·노트북", "디저트 맛집", "주차 편함"], 3);
  assert.equal(got.length, 3);
  for (const g of got) assert.ok(g.emoji, `${g.label}: 이모지가 없다`);
});

// ═══ ⑳ 정체성 문장(synthEngine) — 화면 첫 줄의 주장 강도. 2026-10-18 ═══
//   🔴 발견: `빵` 문구만 "특히 **자주** 언급되는"이라고 **빈도를 단정**하는데 건수 가드가 없었다.
//     실측: 공개 48,744곳 중 후기 6건 미만 11,059곳(23%) · 그중 빈도 주장 **4,768곳**.
//     후기 **2건** 카페 3,212곳 중 **1,155곳(36%)**이 "자주 언급"을 주장했다 — 2건으로 '자주'는 거짓이다.
//   같은 파일이 이미 같은 원칙을 쓴다(`직접로스팅`은 "1건은 환각 위험 → 2건+만 주장")고,
//   결 축·주의점(cafeProfile)은 "표본 6건 미만 판단 안 함"인데 여기만 단정했다 — 규약 불일치였다.
//   → 문장을 없애지 않고(SEO 본문·체감 유지) **'자주'라는 거짓 주장만** 사실 표현으로 바꾼다.
// 🔧 소스 검사 전용 — **주석을 걷어낸 코드만** 돌려준다.
//   2026-10-19에 "주석에 적힌 함수·컬럼 이름을 코드로 세는" 실수를 **네 번** 했다
//   (판정 파싱 2건·프라임 순서 1건·관제탑 큰컬럼 1건). 매번 따로 거르다 또 틀렸다 → 한 곳으로 모은다.
//   소스를 regex로 검사하는 테스트는 **반드시 이 함수를 통과시킨 문자열**을 쓴다.
function codeOf(relUrl: string): string {
  return readFileSync(new URL(relUrl, import.meta.url), "utf8")
    .split("\n")
    .filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("--"); })
    .join("\n");
}

const vr = (t: string) => ({ text: t, trust: "verified" as const });
const BREAD = ["빵이 맛있고 케이크도 촉촉했어요", "크루아상이 바삭했어요 빵 종류가 많아요",
  "케이크가 달지 않고 좋았어요", "소금빵이 유명하대요 빵이 맛있습니다"];

test("정체성: 표본 3건 미만이면 '자주 언급'이라고 주장하지 않는다", () => {
  const s = synthesize("리플렉트랩", BREAD.slice(0, 2).map(vr), ["서울", "강남구"], "카페,디저트>베이커리");
  assert.ok(!s.identity.includes("자주"), `후기 2건으로 빈도를 단정했다: "${s.identity}"`);
  assert.ok(s.identity.length > 5, "문장 자체를 없애면 안 된다(SEO 본문·체감)");
});
test("정체성: 표본 3건 이상이면 빈도 주장을 허용한다(과잉 교정 방지)", () => {
  const s = synthesize("리플렉트랩", BREAD.slice(0, 3).map(vr), ["서울", "강남구"], "카페,디저트>베이커리");
  assert.ok(s.identity.includes("자주"), `3건이면 빈도 주장이 맞다: "${s.identity}"`);
});
test("정체성: 후기 0건이면 중립 문장만", () => {
  const s = synthesize("리플렉트랩", [], ["서울", "강남구"], "카페,디저트>카페");
  assert.ok(!/자주|좋은 곳|맛집/.test(s.identity), `근거 0건으로 단정했다: "${s.identity}"`);
  assert.equal(s.reviewCount, 0);
});
// 🫘 기존 원칙 회귀 — '직접 로스팅'은 1건이면 환각 위험이라 2건+만 주장한다.
test("정체성: '직접 로스팅'은 1건으로 주장하지 않는다", () => {
  const one = synthesize("리플렉트랩", [vr("직접 로스팅한 원두를 쓴다고 하네요")], ["서울", "강남구"], "카페,디저트>카페");
  assert.ok(!one.identity.includes("직접 로스팅"), `1건으로 로스팅을 단정했다: "${one.identity}"`);
});

// ═══ ㉑ AI 판정의 정확성 — "AI가 제대로 내용을 보고 판정한다"는 약속. 2026-10-19 ═══
//   CEO 지시: "우리의 해자와 로직 기반으로 설계된 것을 AI가 제대로 내용을 보고 판정해 주는게
//              우리 서비스의 핵심이라는 걸 명심해! 한치의 오차도 없어야 된다."
//   🔴 배치 응답 원본을 검시해 확정한 결함 3건(전부 실측, 추측 아님):
//     ① 배치 경로의 max_tokens가 1500 **고정**이었다(실시간 경로는 항목수 비례였다).
//        msgbatch_01AB44… 584건 중 2건이 stop_reason=max_tokens(출력 정확히 1,500),
//        msgbatch_01225x… 54건 중 1건. 잘리면 JSON이 깨져 parseVerdicts가 null이 된다.
//     ② 그때 라우트가 **모든 키에 false**를 박았다 → 후보 69건·30건이 "AI 판정: 무관/저품질 제외"로
//        영구 저장(judge_decisions는 재합성에도 유지된다). AI가 보지도 않은 글을 AI 이름으로 버린 것이다.
//     ③ 경계 후보를 slice(0,35)만 보내고 llm_judged_at을 찍어 큐에서 빼, 36번째 이후는 영영 미판정.
//        실측: 경계 35건 초과 4,280곳 · 못 본 후보 140,932건 · 영구 미판정 확정 14,019건.
import { judgeMaxTokens, decisionsFromVerdicts, parseVerdicts, type JudgeVerdict } from "../reviewJudge";
const V = (i: number, about: boolean, helpful: boolean): JudgeVerdict => ({ i, about, helpful, reason: "t" });
const mapOf = (...vs: JudgeVerdict[]) => new Map(vs.map((v) => [v.i, v]));

test("판정 ①: 35항목 요청의 출력 상한이 1,500을 넘는다(잘림 재발 차단)", () => {
  assert.ok(judgeMaxTokens(35) > 1500, `35항목 상한이 ${judgeMaxTokens(35)} — 실측 잘림이 1,500에서 났다`);
  assert.ok(judgeMaxTokens(100) >= 4600, "100항목도 커버해야 한다");
  assert.ok(judgeMaxTokens(1000) <= 8000, "상한은 있어야 한다(폭주 과금 방지)");
});
test("판정 ①: 배치 경로와 실시간 경로가 같은 상한 함수를 쓴다(드리프트 차단)", () => {
  const route = readFileSync(new URL("../../app/api/cron-batch-judge/route.ts", import.meta.url), "utf8");
  assert.ok(/max_tokens:\s*judgeMaxTokens\(/.test(route), "배치 경로가 judgeMaxTokens를 안 쓴다");
  assert.ok(!/max_tokens:\s*1500/.test(route), "max_tokens 1500 고정이 남아 있다");
  const judge = readFileSync(new URL("../reviewJudge.ts", import.meta.url), "utf8");
  assert.ok(/max_tokens:\s*judgeMaxTokens\(/.test(judge), "실시간 경로가 judgeMaxTokens를 안 쓴다");
});

test("판정 ②: 파싱 실패(null)면 단 한 건도 false로 박지 않는다", () => {
  const r = decisionsFromVerdicts(["a", "b", "c"], null);
  assert.deepEqual(r.decisions, {}, "답을 못 읽었는데 결정을 남겼다 — 규칙 판정을 덮어쓴다");
  assert.equal(r.unanswered, 3);
  assert.equal(r.kept, 0);
});
test("판정 ②: 모델이 빼먹은 번호는 미결로 남는다(규칙 판정 유지)", () => {
  const r = decisionsFromVerdicts(["a", "b", "c"], mapOf(V(0, true, true), V(2, false, true)));
  assert.deepEqual(Object.keys(r.decisions).sort(), ["a", "c"], "답 없는 b에 값을 박았다");
  assert.ok(!("b" in r.decisions), "b는 미결이어야 한다 — false는 'AI가 무관하다고 판정'으로 영구 저장된다");
  assert.equal(r.unanswered, 1);
});
test("판정 ②: 채택은 about·helpful 둘 다 참일 때만(라우트와 동일)", () => {
  const r = decisionsFromVerdicts(["a", "b", "c", "d"],
    mapOf(V(0, true, true), V(1, true, false), V(2, false, true), V(3, false, false)));
  assert.deepEqual(r.decisions, { a: true, b: false, c: false, d: false });
  assert.equal(r.kept, 1);
  assert.equal(r.unanswered, 0);
});
test("판정 ②: 수거 경로가 파싱 실패 시 결정을 쓰지 않고 빠져나간다", () => {
  const route = readFileSync(new URL("../../app/api/cron-batch-judge/route.ts", import.meta.url), "utf8");
  // 수거가 직렬 for 루프(continue)든 동시 처리 풀의 콜백(return)이든, **아무 결정도 쓰지 않고 빠져나가야** 한다.
  assert.ok(/if \(!verdicts\) \{ parseFailed\+\+;[\s\S]{0,120}(continue|return); \}/.test(route),
    "파싱 실패 시 곧바로 빠져나가지 않는다 — false가 박힐 수 있다");
  assert.ok(!/decisions\[k\] = !!\(v && v\.about/.test(route), "모든 키에 값을 박는 옛 매핑이 남아 있다");
  assert.ok(/precision: \{ truncated, parseFailed, unanswered \}/.test(route),
    "정확성 계측을 응답에 노출하지 않으면 재발을 못 본다");
});

test("판정 ③: 경계 35건 초과 카페는 '아직 안 본 후보'부터 올린다", () => {
  const route = readFileSync(new URL("../../app/api/cron-batch-judge/route.ts", import.meta.url), "utf8");
  assert.ok(/getUndecidedAuditCandidates\(/.test(route), "판정받은 후보를 걸러내지 않는다 — 36번째 이후가 영영 미판정");
  assert.ok(/judge_passes/.test(route) && /JUDGE_MAX_PASSES/.test(route),
    "재입장 커서에 종료 보장(패스 상한)이 없다 — 무한 재구매 위험");
  assert.ok(/bumpJudgePass\(/.test(route), "패스 카운터를 올리지 않으면 상한이 작동하지 않는다");
});
test("판정 ③: 패스 카운터는 제출 시점에 올린다(수거 못 한 배치로 무한루프 금지)", () => {
  const store = readFileSync(new URL("../synthStore.ts", import.meta.url), "utf8");
  const i = store.indexOf("export async function bumpJudgePass");
  assert.ok(i > 0, "bumpJudgePass가 없다");
  assert.ok(/제출 시점/.test(store.slice(i - 400, i)), "제출 시점에 올린다는 근거 주석이 없다");
});
test("판정: 과거 결정이 배열로 들어와도 조용히 사라지지 않는다", () => {
  const store = readFileSync(new URL("../synthStore.ts", import.meta.url), "utf8");
  assert.ok(/!Array\.isArray\(d\)/.test(store), "typeof []==='object' 를 막지 않았다(실측 15행이 배열)");
});

// 🔴 라이브 보호 — 수거를 동시 처리로 바꾸면서 발견. 호출마다 DDL이면 cafes에 배타락이 반복돼
//   실사용자 조회가 밀린다. 카페 단위 함수에 ALTER가 다시 들어오지 못하게 못으로 박는다.
test("판정: 카페 단위 함수가 호출마다 DDL(ALTER TABLE)을 치지 않는다", () => {
  const store = readFileSync(new URL("../synthStore.ts", import.meta.url), "utf8");
  for (const fn of ["markJudged", "bumpJudgePass"]) {
    const i = store.indexOf(`export async function ${fn}`);
    assert.ok(i > 0, `${fn}이 없다`);
    // 주석에 'ALTER TABLE'이라는 글자가 나오는 건 정상(왜 없앴는지 적어둔 근거다) — **코드 줄만** 본다.
    const body = store.slice(i, store.indexOf("\n}", i))
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.ok(!/ALTER TABLE/.test(body), `${fn}이 호출마다 ALTER TABLE을 친다 — 동시 처리 시 라이브가 밀린다`);
  }
});

// 🔴 Next는 정적 분석 가능한 `process.env.X`(점 접근)를 **빌드 시점에 리터럴로 치환**한다.
//   런타임 조절이 필요한 노브(동시성·배치크기·패스상한)를 점 접근으로 쓰면 조용히 기본값으로 굳는다.
//   실측 2026-10-19: 동시 6을 줬는데 분당 14곳(직렬 12.7과 동일)·CPU 1.7% — 병렬이 안 걸렸다.
test("판정: 런타임 노브는 대괄호 접근으로 읽는다(Next 빌드시 치환 회피)", () => {
  const route = readFileSync(new URL("../../app/api/cron-batch-judge/route.ts", import.meta.url), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");   // 주석의 설명문은 코드가 아니다
  const judge = readFileSync(new URL("../reviewJudge.ts", import.meta.url), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  // JUDGE_MODEL도 같은 함정이었다 — 점 접근이면 모델 전환에 **재빌드**가 필요해진다(2026-10-19).
  assert.ok(!/process\.env\.JUDGE_MODEL\b/.test(judge), "JUDGE_MODEL을 점 접근으로 읽는다 — 빌드 시점에 굳는다");
  assert.ok(judge.includes('process.env["JUDGE_MODEL"]'), "JUDGE_MODEL을 대괄호로 읽지 않는다");
  for (const k of ["JUDGE_CONCURRENCY", "JUDGE_MAX_PASSES", "BATCH_JUDGE_LIMIT"]) {
    assert.ok(!new RegExp(`process\\.env\\.${k}\\b`).test(route), `${k}를 점 접근으로 읽는다 — 빌드 시점에 굳는다`);
    assert.ok(route.includes(`process.env["${k}"]`), `${k}를 대괄호로 읽지 않는다`);
  }
});

// 🎯 구제 가능성 게이트(scope=flip) — CEO 질문 "후보 구제율이 왜 이렇게 낮은데?"의 답을 코드로 박는다.
//   신규 공개는 주제 글(검증) 1건을 요구하는데, AI가 살린 경계 후기는 '참고'가 되고 '검증'이 안 된다
//   (collectOrchestrator: `rule.verdict === "verified" ? "verified" : "reference"`, 경계는 항상 rejected).
//   → 주제 글 0건 카페(실측 85.4%)에 판정비를 쓰면 결과를 바꿀 수 없다. 범위 정의가 갈라지면 또 샌다.
test("판정 범위: flip 구간은 라우트와 집행기가 같은 네 조건을 쓴다", () => {
  const route = readFileSync(new URL("../../app/api/cron-batch-judge/route.ts", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../../scripts/judge-run.mjs", import.meta.url), "utf8");
  const must = [
    /= 'flip'/, /raw_collected_at > now\(\) - interval '30 day'/, /embedding IS NOT NULL/,
    /naver_category/, /synth_count,\s*0\)\s*\+\s*COALESCE\(borderline_count,\s*0\)\s*>= 2/,
    /synth_quality->>'verified'\)::int,\s*0\)\s*>= 1/,
  ];
  for (const re of must) {
    assert.ok(re.test(route), `라우트에 flip 조건이 없다: ${re}`);
    assert.ok(re.test(runner), `집행기에 flip 조건이 없다: ${re}`);
  }
});
test("판정: 'AI가 살린 경계 후기는 검증이 아니다'는 전제가 코드와 일치한다", () => {
  const orch = readFileSync(new URL("../collectOrchestrator.ts", import.meta.url), "utf8");
  // 경계 후보가 decisions로 채택되면 verified가 아니라 reference가 된다 — 이 전제가 flip 조건의 근거다.
  assert.ok(/decisions\[key\]\) \{ verdict = rule\.verdict === "verified" \? "verified" : "reference"/.test(orch),
    "채택 경로가 바뀌었다 — flip 조건(주제 글 1건)의 근거를 다시 확인해야 한다");
});

// 🛑 판정 대량 비공개 차단기 — 2026-10-19. 힐러엔 2026-07-29부터 상한이 있었는데 **판정 경로엔 없었다.**
//   실측 위험: 재정제 대상 21,145곳 중 후기 2건 이하가 1,778곳(8.4%) — 거절 1건에 비공개로 내려간다.
//   최근 7일 실측 비공개 전환 502곳. 24,737곳 일괄 집행 시 회귀 한 번에 수백~수천 곳이 화면에서 사라진다.
//   ⚠️ 비공개를 막는 게 아니다(AI가 '이 가게 글이 아니다'라고 보면 내려가는 게 맞다) — **한 회차의 속도**를 막는다.
test("판정: 공개→비공개 전환에 상한 차단기가 있다", () => {
  const route = readFileSync(new URL("../../app/api/cron-batch-judge/route.ts", import.meta.url), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.ok(/JUDGE_UNPUB_CAP/.test(route), "판정 경로에 비공개 상한이 없다");
  assert.ok(/unpublished > JUDGE_UNPUB_CAP/.test(route), "상한을 실제로 비교하지 않는다");
  assert.ok(/cappedStop = true/.test(route), "상한 초과 시 집행을 멈추지 않는다");
  assert.ok(/if \(cappedStop\) return;/.test(route), "멈춤 신호를 적용 루프가 읽지 않는다");
  assert.ok(/unpublished, cappedStop/.test(route), "응답에 노출하지 않으면 재발을 못 본다");
});
test("판정: 비공개 전환 판정에 '직전 공개상태'를 쓴다(왕복 추가 없이)", () => {
  const store = readFileSync(new URL("../synthStore.ts", import.meta.url), "utf8");
  assert.ok(/COALESCE\(published, false\) AS was_published/.test(store),
    "storeResult의 현재상태 SELECT에 published가 없다 — 내려간 수를 셀 수 없다");
  assert.ok(/wasPublished: !!cur\?\.was_published/.test(store), "storeResult가 wasPublished를 반환하지 않는다");
});

// 🛡️ 보수적 유지 — CEO 지시(2026-10-19): "비공개는 보수적으로 해. 이미 공개된 거고 판정으로 인해
//   진짜 오염이나 근거 없는 게 아니라면 되도록 유지해."
//   실측: 판정으로 내려간 799곳 중 398곳이 '등급미달(후보)' 단독, 그중 379곳은 근거가 1건 이상 남아
//   있었다 — 오염이 아니라 건수가 문턱(grade.floor.reference=2) 아래로 간 것뿐이다. 379곳을 복구했다.
test("보수적 유지: 이미 공개된 카페는 등급미달만으로 내리지 않는다", () => {
  const store = readFileSync(new URL("../synthStore.ts", import.meta.url), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.ok(/const keepLive = !!cur\?\.was_published && collected >= 2 && isCafeCat && !noisy;/.test(store),
    "keepLive 규칙이 없거나 조건이 바뀌었다 — 문턱은 2건이다(CEO: 리뷰 1개면 비공개)");
  assert.ok(/\(\(gradeOk && isCafeCat && !noisy\) \|\| keepLive\)/.test(store),
    "라이브 분기 ruleOk가 keepLive를 쓰지 않는다");
  // 🔴 신규(공개 전)에는 절대 적용하지 않는다 — 공개 게이트는 엄격해야 한다.
  assert.ok(/inPipeline && !everPassedGate\s*\n?\s*\? \(gradeOk && isCafeCat && !isFranchise\(name\) && !noisy\)/.test(store),
    "신규 분기에 완화가 섞였다 — 공개 전 게이트는 엄격해야 한다");
});
test("보수적 유지: 근거 0건·오염·비카페는 그대로 내린다", () => {
  const store = readFileSync(new URL("../synthStore.ts", import.meta.url), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  const i = store.indexOf("const keepLive =");
  const line = store.slice(i, store.indexOf("\n", i));
  // 🔴 문턱 2건 — CEO 지시(2026-10-19) "근거 1개는 좀 심하네. 리뷰가 1개인 거야? 그럼 비공개로 해."
  //   1건으로 열었다가 320곳을 복구했고, 지시받아 전부 되돌렸다. 1로 내려가면 그 사고가 재발한다.
  assert.ok(/collected >= 2/.test(line), "문턱이 2건이 아니다 — 후기 1건 카페가 공개로 남는다");
  assert.ok(/!noisy/.test(line), "오염(노이즈)도 유지해버린다");
  assert.ok(/isCafeCat/.test(line), "비카페 분류도 유지해버린다");
});
test("보수적 유지: 공개를 유지하면 표시 등급이 '후보'로 떨어지지 않는다", () => {
  const store = readFileSync(new URL("../synthStore.ts", import.meta.url), "utf8");
  assert.ok(/const gradeOut = \(publish && !gradeOk && keepLive/.test(store), "gradeOut 보정이 없다");
  assert.ok(!/UPDATE cafes SET synth_grade=\$\{grade\},/.test(store),
    "UPDATE가 보정 전 grade를 쓴다 — 공개 중 '후보'라는 새 상태가 생긴다");
});

// 👁️ 감시 지표 — 2026-10-19. 「감시자는 감시대상과 같이 멈추면 안 된다」의 짝: **감시 지표가 거짓이면
//   감시가 없는 것과 같다.** 실측 사고: `NOT published AND exclude_at > now()-10min`으로 '판정 비공개'를
//   셌더니 277곳이라고 경보했는데 실제 신규 비공개는 0곳이었다. 두 가지가 섞였다 —
//     ① 내가 직접 한 데이터 조작(1건 카페 320곳 되돌림)도 exclude_at을 now()로 찍는다
//     ② **이미 비공개였던 카페**를 재합성하면 exclude_at이 갱신된다(rescue 구간은 전부 미공개다)
//   → 감시는 공개 수의 **순변동**을 본다. 소비자가 보는 것이 늘었나 줄었나를 그대로 말해준다.
test("감시: 판정 감시는 exclude_at이 아니라 공개 수 순변동을 본다", () => {
  const w = readFileSync(new URL("../../scripts/judge-watch.mjs", import.meta.url), "utf8");
  const code = w.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.ok(/count\(\*\) FILTER \(WHERE published\)::int pub/.test(code), "공개 수를 세지 않는다");
  assert.ok(/r\.pub - prev\.pub/.test(code), "순변동(delta)을 계산하지 않는다");
  assert.ok(!/exclude_at > now\(\)/.test(code),
    "exclude_at 기반 경보가 다시 들어왔다 — 내 데이터 조작과 재합성 갱신이 섞여 거짓 경보가 난다");
  // CEO 지시 2건이 감시에 걸려 있어야 한다: 후기 1건 공개 금지 · 공개 중 '후보' 등급 금지
  assert.ok(/synth_count,0\) <= 1\)::int thin/.test(code), "공개 중 후기1건 감시가 없다");
  assert.ok(/synth_grade = '후보'\)::int odd/.test(code), "공개 중 '후보' 등급 감시가 없다");
});

// 🔴 2026-10-19 재측정 — 판정 응답을 버리던 두 결함(565곳 배치에서 58곳 파싱실패 = 11.4%).
//   ⒜ 후보 1건이면 모델이 **배열 없이 단일 객체**로 답한다 → 정규식 불일치 + for...of 폭발로 null (26곳)
//   ⒝ 출력이 잘리면 **전부** 버렸다 → 앞의 완성된 객체는 건질 수 있었다 (32곳, 평균 1,586토큰)
//   그리고 상한 600+40n이 작았다: 15-29건 구간 잘림 30.0% · 30+건 32.1% · 1-4건은 최대 732 > 상한 720.
test("판정 파싱 ⒜: 배열 없는 단일 객체 응답도 읽는다", () => {
  const m = parseVerdicts('{"i":0,"about":true,"helpful":true,"reason":"재방문 경험과 메뉴평 포함"}');
  assert.ok(m, "단일 객체를 못 읽었다 — 실측 26곳이 이것 때문에 버려졌다");
  assert.equal(m.get(0)?.about, true);
  assert.equal(m.get(0)?.helpful, true);
});
test("판정 파싱 ⒝: 잘린 배열에서 완성된 객체는 건진다", () => {
  const cut = '[{"i":0,"about":true,"helpful":true,"reason":"맛 평가"},'
            + '{"i":1,"about":false,"helpful":false,"reason":"다른 가게"},'
            + '{"i":2,"about":true,"helpful":tr';   // ← 여기서 잘렸다
  const m = parseVerdicts(cut);
  assert.ok(m, "잘린 응답을 전부 버렸다");
  assert.equal(m.size, 2, "완성된 2건을 건져야 한다");
  assert.equal(m.get(0)?.about, true);
  assert.equal(m.get(1)?.about, false);
  assert.equal(m.get(2), undefined, "잘린 조각은 추측하지 말고 미결로 둬야 한다");
});
test("판정 파싱: 건질 게 하나도 없으면 null(규칙 판정 유지)", () => {
  assert.equal(parseVerdicts("죄송합니다, 판정할 수 없습니다."), null);
  assert.equal(parseVerdicts(""), null);
});
test("판정 파싱: 코드블록으로 감싼 배열도 읽는다(회귀)", () => {
  const m = parseVerdicts('```json\n[{"i":0,"about":true,"helpful":true,"reason":"ok"}]\n```');
  assert.equal(m?.get(0)?.helpful, true);
});
test("판정 상한: 실측 소요(항목당 ~50토큰)를 여유 있게 덮는다", () => {
  // 실측 최대(2026-10-19 3차, Haiku 5.5는 Sonnet보다 1.6배 길게 쓴다): n≈2에서 1,200 · n≈9에서 2,200 ·
  //   n≈20에서 3,700 · n≈34에서 4,300. 이 값들을 덮어야 잘림이 사라진다.
  assert.ok(judgeMaxTokens(2) >= 1200, `후보 2건 실측 최대 1,200을 못 덮는다(${judgeMaxTokens(2)})`);
  assert.ok(judgeMaxTokens(9) >= 2200, `후보 9건 실측 최대 2,200을 못 덮는다(${judgeMaxTokens(9)})`);
  assert.ok(judgeMaxTokens(20) >= 3700, `후보 20건 실측 최대 3,700을 못 덮는다(${judgeMaxTokens(20)})`);
  assert.ok(judgeMaxTokens(35) >= 4300, `후보 35건 실측 최대 4,300을 못 덮는다(${judgeMaxTokens(35)})`);
  assert.ok(judgeMaxTokens(1000) <= 8000, "상한은 있어야 한다");
});

// 🔴 네이버 쿼터는 **앱 전체 공유 25,000/일**이고 naver_budget 카운터가 발굴+수집+마이닝을 전부 계상한다.
//   2026-10-19 발견: lib/naverBudget.ts 주석이 "발굴 전용 · API별 한도 따로 · discover.ts 한 곳에서만 호출"
//   이라고 **거꾸로** 적혀 있었다. 단일 출처에 거짓이 있으면 모든 계획·보고가 거짓이 된다.
//   호출처가 줄어/늘어나면 이 테스트가 먼저 깨져 주석을 다시 보게 만든다.
test("네이버 쿼터: bumpNaver는 발굴·수집·마이닝 세 경로에서 계상한다(공유 한도)", () => {
  const callers = ["../discover.ts", "../webSearchCollector.ts", "../reviewMiner.ts"];
  for (const f of callers) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(/bumpNaver\(/.test(src), `${f}가 bumpNaver를 호출하지 않는다 — 공유 한도 계상이 깨진다`);
  }
  const budget = readFileSync(new URL("../naverBudget.ts", import.meta.url), "utf8");
  assert.ok(!/bumpNaver는 lib\/discover\.ts 한 곳에서만 호출된다/.test(budget),
    "거꾸로였던 옛 주석이 되살아났다");
  assert.ok(/앱 전체 공유/.test(budget), "공유 한도라는 사실이 단일 출처에 적혀 있어야 한다");
});

// 🚦 적체 정의 정합 — 「단계의 적체 정의는 그 단계를 전진시키는 잡의 큐 정의와 글자까지 같아야 한다」.
//   2026-10-19 실측 사고: 수집 레인에 3,211곳의 일이 생겼는데 `collectBacklog`은 `pipeline_status='new'`만
//   세서 0을 돌려줬다 → 수집 예약이 최소치 → 발굴이 쿼터를 먼저 다 쓰면 수집 창이 또 굶는다(08-25 사고 클래스).
//   🔴 동시에, gap 적체를 `discoveryMayRun`(정지 임계 3,000)에 넣으면 3,211 > 3,000으로 **발굴이 통째로 멈춘다**.
//   그래서 둘을 분리했다: 예약 계산엔 넣고, 발굴 정지 판정엔 넣지 않는다.
test("쿼터 적체: gap 큐 정의가 수집 레인과 같다(예약이 거짓이 되지 않게)", () => {
  const budget = readFileSync(new URL("../naverBudget.ts", import.meta.url), "utf8");
  const shard = readFileSync(new URL("../../scripts/collect-shard.mjs", import.meta.url), "utf8");
  const must = [
    /COALESCE\(pipeline_status, ''\) NOT IN \('excluded', 'noise'\)/,
    /raw_reviews IS NULL OR COALESCE\(jsonb_array_length\(raw_reviews\), 0\) = 0/,
    /raw_checked_at IS NULL OR raw_checked_at < now\(\) - interval '30 days'/,
    /lat IS NOT NULL/,
  ];
  for (const re of must) {
    assert.ok(re.test(budget), `naverBudget.gapBacklog에 조건이 없다: ${re}`);
    assert.ok(re.test(shard), `collect-shard의 gap 큐에 조건이 없다: ${re}`);
  }
});
test("쿼터 적체: gap은 발굴 정지 판정에 들어가지 않는다(발굴 전면정지 방지)", () => {
  const budget = readFileSync(new URL("../naverBudget.ts", import.meta.url), "utf8");
  const i = budget.indexOf("export async function discoveryMayRun");
  const body = budget.slice(i, budget.indexOf("\n}", i));
  assert.ok(!/gapBacklog/.test(body),
    "discoveryMayRun이 gapBacklog를 본다 — 일회성 적체 3,211곳이 임계 3,000을 넘겨 발굴이 통째로 멈춘다");
  // 예약 계산에는 반드시 들어가야 한다
  const j = budget.indexOf("export async function collectReserveNow");
  const resBody = budget.slice(j, budget.indexOf("\n}", j));
  assert.ok(/gapBacklog/.test(resBody), "collectReserveNow가 gap 몫을 예약하지 않는다 — 수집 창이 굶는다");
  assert.ok(/GAP_DAILY_CAPACITY/.test(resBody), "적체 전체를 예약하면 발굴을 과하게 굶긴다 — 하루 소화량으로 제한해야 한다");
});

// 🔴 규칙 사전 프라임 — 2026-10-19 실측 결함. `isFranchise`·`isNonCafe`·`isGenericFoodName`은
//   하드코딩 목록 **+ 학습 용어(DB)** 를 함께 본다(discover.ts의 getLearned). 학습 용어는
//   loadLearnedTerms()로 캐시에 올려야 보인다. 증거: 로드 전 isFranchise("빵집오빠 수원우만점")=false
//   → 로드 후 **true**(학습 프랜차이즈 22개). 프라임 없이 사전 필터를 돌리면 **공개 관문보다 약해서**
//   관문이 결국 거절할 카페에 네이버 콜을 헛쓴다(순수 낭비). 운영 스크립트 3개가 그 상태였다.
//   패턴 출처: scripts/import-permits.mjs:32.
test("규칙 사전: 규칙을 쓰는 스크립트는 loadLearnedTerms를 먼저 호출한다", () => {
  const files = ["collect-shard.mjs", "deep-collect.mjs", "dong-backfill.mjs",
                 "resynth-gate-stale.mjs", "judge-restore-gradeonly.mjs", "collect-deeper-probe.mjs"];
  const USE = /\b(isFranchise|isNonCafe|verifyReview|isGenericFoodName)\s*\(/;
  for (const f of files) {
    const src = readFileSync(new URL(`../../scripts/${f}`, import.meta.url), "utf8");
    let prime = -1, firstUse = -1;
    src.split("\n").forEach((raw, i) => {
      const t = raw.trim();
      if (t.startsWith("//") || t.startsWith("*")) return;   // 주석의 함수 이름은 '사용'이 아니다
      const code = raw.split("//")[0];
      if (prime < 0 && code.includes("await loadLearnedTerms()")) prime = i;
      if (firstUse < 0 && USE.test(code) && !code.includes("typeof") && !code.includes("import(")) firstUse = i;
    });
    assert.ok(prime >= 0, `${f}: loadLearnedTerms를 호출하지 않는다 — 사전 필터가 관문보다 약해진다`);
    if (firstUse >= 0) assert.ok(prime < firstUse, `${f}: 규칙을 쓰기 전에 프라임하지 않는다(프라임 ${prime + 1}행 · 첫 호출 ${firstUse + 1}행)`);
  }
});

// 🛡️ scope=thin — 2026-10-19 실측. 비공개 전환 위험이 '공개 문턱 근접(후기 4건 이하)' 구간에 집중된다.
//   배치별 전환율이 그 비율에 정비례했다: Sonnet 4.9%→0.04% · Haiku#1 6.8%→0.20% · Haiku#2 10.9%→0.42%.
//   얇은 카페당 정규화: Haiku 3.0~3.8% vs Sonnet 0.75%. CEO 지시 "비공개는 보수적으로" →
//   **위험 구간에만 좋은 모델**을 쓰는 배분이 비용·품질을 동시에 만족한다(전량 Sonnet은 예산 초과).
test("판정 범위: thin 구간이 라우트와 집행기에서 같은 정의다", () => {
  const route = readFileSync(new URL("../../app/api/cron-batch-judge/route.ts", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../../scripts/judge-run.mjs", import.meta.url), "utf8");
  for (const src of [route, runner]) {
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("--")).join("\n");
    assert.ok(/= 'thin'/.test(code), "thin 구간이 없다");
    assert.ok(/COALESCE\(synth_count,\s*0\)\s*<=\s*4/.test(code), "thin의 문턱 근접 조건(후기 4건 이하)이 없다");
  }
});
test("판정 집행 순서: thin(좋은 모델)이 refine(싼 모델)보다 먼저다", () => {
  const chain = readFileSync(new URL("../../scripts/judge-chain.sh", import.meta.url), "utf8");
  const iThin = chain.indexOf("run thin");
  const iRefine = chain.indexOf("run refine");
  assert.ok(iThin > 0 && iRefine > 0, "체인에 thin·refine이 없다");
  assert.ok(iThin < iRefine,
    "thin이 refine보다 늦으면 얇은 카페가 싼 모델에 먼저 먹혀 보수적 비공개 원칙이 깨진다");
  assert.ok(/run thin\s+claude-sonnet-5/.test(chain), "thin에 Sonnet 5를 쓰지 않는다");
  assert.ok(/run refine\s+claude-haiku-5-5/.test(chain), "refine에 Haiku 5.5를 쓰지 않는다");
});

// 🔬 판정 세밀화 — 2026-10-19. CEO 지시("판정을 더 세밀하게"). 실측 근거: 노출 중인 후기의 **43.95%**를
//   AI가 거부했고(표본 50곳·976건) 사유가 `정보나열 위주`·`해시태그 나열`에 몰렸다. about/helpful
//   boolean 2개로는 "얼마나 구체적인가"를 노출 순서에 쓸 수 없었다.
//   → depth(0~3)·adStyle(협찬 문체)·listicle(나열글) 세 축을 더하고, **나열글은 채택하지 않는다**.
test("판정 세밀화: 나열글(listicle)은 채택하지 않는다", () => {
  const V = (i: number, o: Partial<JudgeVerdict>) => ({ i, about: true, helpful: true, reason: "t", ...o } as JudgeVerdict);
  const m = new Map([[0, V(0, { listicle: true })], [1, V(1, { listicle: false })]]);
  const r = decisionsFromVerdicts(["a", "b"], m);
  assert.equal(r.decisions.a, false, "나열글을 채택했다 — 우리 카페가 한 줄 스친 글이 대표 후기가 된다");
  assert.equal(r.decisions.b, true);
  assert.equal(r.lists, 1);
});
test("판정 세밀화: depth·adStyle이 key별로 보존된다(노출 순서·협찬 감시용)", () => {
  const V = (i: number, o: Partial<JudgeVerdict>) => ({ i, about: true, helpful: true, reason: "t", ...o } as JudgeVerdict);
  const r = decisionsFromVerdicts(["a", "b"], new Map([[0, V(0, { depth: 3 })], [1, V(1, { depth: 1, adStyle: true })]]));
  assert.equal(r.marks.a?.depth, 3);
  assert.equal(r.marks.b?.adStyle, true);
  assert.equal(r.ads, 1);
  assert.equal(r.depthAvg, 2);
});
test("판정 세밀화: 옛 응답(축 없음)도 그대로 읽힌다(하위호환)", () => {
  const r = decisionsFromVerdicts(["a"], new Map([[0, { i: 0, about: true, helpful: true, reason: "t" }]]));
  assert.equal(r.decisions.a, true, "축이 없으면 채택이 막혀선 안 된다");
  assert.equal(r.depthAvg, null);
  assert.deepEqual(r.marks, {});
});
test("판정 세밀화: RUBRIC이 세 축을 요구하고 협찬 추측을 금지한다", () => {
  const judge = readFileSync(new URL("../reviewJudge.ts", import.meta.url), "utf8");
  for (const k of ["depth", "adStyle", "listicle"]) assert.ok(judge.includes(`"${k}"`), `RUBRIC 응답 형식에 ${k}가 없다`);
  assert.ok(/협찬 '공시'는 발췌에 들어오지 않으니 추측하지 마라/.test(judge),
    "협찬 공시 추측 금지 문구가 사라졌다 — 없는 근거로 판정하면 오판이 된다");
});

// 📋 정보 나열 글 강등 — 2026-10-19. 규칙갭 AI 발굴로 찾은 가장 큰 구멍.
//   실측: 노출 중인 후기의 **43.95%를 AI가 거부**(표본 50곳·976건), 품질 미달 429건 중 **82%가 경험 서술어 0건**.
//   케이스는 전부 실제 노출된 글이다(비디788 PV18 등). 🔴 거절이 아니라 **순위 강등**이다 —
//   스니펫이 153자 발췌라 경험 서술이 발췌 밖일 수 있고, 거절하면 진짜 후기를 버린다.
import { isInfoDumpQuote } from "../exposureOrder";
test("정보나열: 주소·영업시간·전화번호만 있는 글은 나열글로 본다", () => {
  assert.equal(isInfoDumpQuote("비디788 주소 : 경기 성남시 분당구 판교로 788 영업시간 : 9:00 ~ 20:30 전화번호 : 0507-1370-1502 메뉴판"), true);
  assert.equal(isInfoDumpQuote("비디788 경기 성남시 분당구 판교로 788 영업시간 매일 09:00 ~ 20:30 (라스트오더 20:00) 주차공간 전용 주차장"), true);
});
test("정보나열: 해시태그 뭉치도 나열글로 본다", () => {
  assert.equal(isInfoDumpQuote("비디788 (BD788) 유럽형 대형카페 #야탑역대형카페 #BD788 #야탑브런치카페 #분당카페"), true);
  assert.equal(isInfoDumpQuote("좋은 카페 #카페"), false, "해시태그 1~2개는 정상 글에도 흔하다");
});
test("정보나열: 경험 서술이 하나라도 있으면 강등하지 않는다(진짜 후기 보호)", () => {
  assert.equal(isInfoDumpQuote("주소 : 경기 성남시 판교로 788 영업시간 9:00~20:30 인데 소금빵을 먹었는데 바삭했어요"), false);
  assert.equal(isInfoDumpQuote("라떼가 부드럽고 직원분이 친절했어요"), false);
  assert.equal(isInfoDumpQuote(""), false);
});
test("정보나열: 등급 아래에서만 작동한다(공개·등급 불변)", () => {
  const src = readFileSync(new URL("../exposureOrder.ts", import.meta.url), "utf8");
  const cmp = src.slice(src.indexOf(".sort((a, b) =>"));
  const iTier = cmp.indexOf("trustTier(b.e) - trustTier(a.e)");
  const iInfo = cmp.indexOf("b.info - a.info");
  assert.ok(iTier > 0 && iInfo > 0, "정렬 키를 못 찾았다");
  assert.ok(iTier < iInfo, "정보나열 강등이 신뢰등급보다 위에 있다 — 참고글이 검증글을 밀어낼 수 있다");
});

// 💰 비용 하드규칙 — 2026-10-19. CEO 지시("버셀·네온·ISR write 비용 증가에 큰 영향 없도록 확실하게").
//   `cafes` 행은 평균 78KB(벡터·GIN 인덱스 다수)라 작은 값 하나만 갱신해도 **행 전체를 다시 쓴다.**
//   2026-09-26에 정확히 이 패턴으로 cost_guard가 자동정지했다(noncafe UPDATE 89.7GB · decision#1262).
//   해법은 경량 테이블 분리(cafe_scan_state와 같은 사상). 판정 세밀 축도 같은 함정에 빠졌다가 수리했다 —
//   판정 40,767곳이면 추가 쓰기 약 3.2GB였고, storeResult UPDATE와 별개라 같은 행을 **두 번** 썼다.
test("비용: 판정 세밀 축은 cafes가 아니라 경량 테이블에 쓴다", () => {
  const route = readFileSync(new URL("../../app/api/cron-batch-judge/route.ts", import.meta.url), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.ok(!/UPDATE cafes SET judge_marks/.test(route),
    "cafes에 judge_marks를 쓴다 — 78KB 행을 매번 다시 쓴다(09-26 cost_guard 정지 패턴)");
  assert.ok(!/ALTER TABLE cafes ADD COLUMN IF NOT EXISTS judge_marks/.test(route),
    "cafes에 judge_marks 컬럼을 만든다 — 넓은 행에 붙이면 안 된다");
  assert.ok(/INSERT INTO cafe_judge_marks/.test(route), "경량 테이블(cafe_judge_marks)에 쓰지 않는다");
});

// 🔬 AI 세밀 축이 **실제로 노출에 영향을 주는가** — 2026-10-19.
//   실측 사고: 협찬 문체 348곳·나열글 260곳을 AI가 찾아놨는데 **쓰는 곳이 없었다**(돈만 쓴 상태).
//   판정을 돌려도 결과를 안 쓰면 비용만 나간다. 그래서 ①evidence에 key를 싣고 ②경량 테이블에서 붙이고
//   ③노출 순서가 읽게 만들었다. 이 사슬이 끊기면 다시 "수집만 하는" 상태로 돌아간다.
test("세밀 축: AI 나열글·협찬문체는 노출 순서에서 뒤로 간다", () => {
  const mk = (q: string, o: any = {}) => ({ quote: q, trust: "verified", score: 80, date: "2026.10.01", ...o });
  const out = sortReviews([
    mk("라떼가 부드럽고 좋았어요 또 가고 싶어요", { adStyle: true }),
    mk("소금빵을 먹었는데 바삭하고 짭짤해서 맛있었어요", { depth: 3 }),
    mk("직원분이 친절했고 자리가 넓어서 편했어요", { listicle: true }),
  ], "테스트카페", ["서울", "강남구"], Date.now());
  assert.equal(out[0].depth, 3, "구체성 높은 후기가 맨 앞이어야 한다");
  assert.ok(out[1].adStyle || out[1].listicle, "의심 신호가 있는 후기는 뒤로 가야 한다");
});
test("세밀 축: 구체성(depth) 높은 후기가 앞으로 — 같은 등급 안에서", () => {
  const mk = (q: string, d: number) => ({ quote: q, trust: "verified", score: 80, date: "2026.10.01", depth: d });
  const out = sortReviews([mk("괜찮았어요 또 갈게요", 1), mk("아인슈페너를 마셨는데 크림이 진했어요", 3), mk("맛있게 먹었어요", 2)],
    "테스트카페", ["서울"], Date.now());
  assert.deepEqual(out.map((x: any) => x.depth), [3, 2, 1]);
});
test("세밀 축: 부착 사슬이 끊기지 않는다(key·경량테이블·노출)", () => {
  const orch = readFileSync(new URL("../collectOrchestrator.ts", import.meta.url), "utf8");
  assert.ok(/k\?: string; depth\?: number; adStyle\?: boolean; listicle\?: boolean;/.test(orch), "EvidenceReview에 축 필드가 없다");
  assert.ok(/k: key,/.test(orch), "evidence에 key를 싣지 않는다 — 축을 붙일 방법이 없다");
  const store = readFileSync(new URL("../synthStore.ts", import.meta.url), "utf8");
  assert.ok(/SELECT marks FROM cafe_judge_marks/.test(store), "경량 테이블에서 축을 읽지 않는다");
  assert.ok(/depth: m\.depth, adStyle: m\.adStyle, listicle: m\.listicle/.test(store), "evidence에 축을 붙이지 않는다");
  const exp = readFileSync(new URL("../exposureOrder.ts", import.meta.url), "utf8");
  assert.ok(/e\?\.listicle === true \|\| e\?\.adStyle === true/.test(exp), "노출 순서가 AI 의심 신호를 읽지 않는다");
  assert.ok(/b\.depth - a\.depth/.test(exp), "노출 순서가 구체성을 쓰지 않는다");
});

// 🔴 SQL 템플릿 주석에 **백틱 금지** — 2026-10-19에 같은 실수를 **세 번** 했다.
//   Neon 태그드 템플릿(sql`…`) 안의 `--` 주석에 백틱을 쓰면 템플릿 문자열이 그 자리에서 끊겨
//   TS1005로 빌드가 깨진다. 파일 자체 주석(route.ts)에 이미 "이 주석에 백틱을 쓰면 템플릿 문자열이
//   끊긴다 -- 실제로 한 번 깨졌다"고 적혀 있었는데도 반복했다 → 사람이 조심하는 대신 관문이 막는다.
test("SQL 템플릿: 태그드 템플릿 안의 주석에 백틱이 없다", () => {
  for (const f of ["../../app/api/cron-batch-judge/route.ts", "../../scripts/judge-run.mjs"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    // sql` … ` 구간을 훑어 '--' 주석 줄에 백틱이 있는지 본다(있으면 애초에 템플릿이 끊겨 파싱 불가).
    const re = /sql(?:\.query)?`([\s\S]*?)`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      for (const line of m[1].split("\n")) {
        const t = line.trim();
        if (!t.startsWith("--")) continue;
        assert.ok(!t.includes("`"), `${f}: SQL 주석에 백틱이 있다 → ${t.slice(0, 60)}`);
      }
    }
  }
});

// 💬 사용자 한 줄 피드백 — 2026-10-19 신설. 우리에게 **실사용자 직접 피드백 채널이 없었다**
//   (품질을 전부 내부 지표로 추정했다). CEO와 합의한 설계 제약을 못으로 박는다.
test("피드백: 뒤로가기를 가로채지 않는다(모바일 제스처·검색 복귀 보호)", () => {
  const bar = readFileSync(new URL("../../app/c/[id]/FeedbackBar.tsx", import.meta.url), "utf8");
  const code = bar.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  for (const bad of ["popstate", "pushState", "beforeunload", "history.back"]) {
    assert.ok(!code.includes(bad), `뒤로가기/이탈을 가로챈다(${bad}) — 유입 34%가 모바일이고 81%가 검색이다`);
  }
});
test("피드백: 한 탭만으로 접수된다(텍스트 필수 아님)", () => {
  const bar = readFileSync(new URL("../../app/c/[id]/FeedbackBar.tsx", import.meta.url), "utf8");
  // 👍/👎 누르는 즉시 send 한다 — 텍스트 입력 전에 이미 신호가 남아야 응답률이 유지된다.
  assert.ok(/setKind\("like"\); send\("like"\)/.test(bar), "좋아요 탭이 즉시 접수하지 않는다");
  assert.ok(/setKind\("meh"\); send\("meh"\)/.test(bar), "아쉬워요 탭이 즉시 접수하지 않는다");
  const api = readFileSync(new URL("../../app/api/feedback/route.ts", import.meta.url), "utf8");
  assert.ok(/String\(b\?\.note \?\? ""\)\.trim\(\)\.slice\(0, 500\) \|\| null/.test(api), "본문 상한·선택 처리가 없다");
});
test("피드백: 도배 차단과 입력 검증이 있다", () => {
  const api = readFileSync(new URL("../../app/api/feedback/route.ts", import.meta.url), "utf8");
  assert.ok(/KINDS\.has\(kind\)/.test(api), "종류 검증이 없다");
  assert.ok(/anon\.length < 8/.test(api), "기기키 검증이 없다");
  assert.ok(/interval '24 hours'/.test(api), "같은 기기·같은 대상 24시간 1건 제약이 없다");
});
test("피드백: 관제탑은 글이 달린 것부터 보여주고 인증을 요구한다", () => {
  const adm = codeOf("../../app/api/admin/feedback/route.ts");   // 주석 제외 — 코드만 본다
  assert.ok(/x-admin-password/.test(adm) && /status: 401/.test(adm), "인증이 없다");
  assert.ok(/ORDER BY \(COALESCE\(f\.note,''\) <> ''\) DESC/.test(adm), "글 달린 것을 먼저 보여주지 않는다");
  assert.ok(/LIMIT 120/.test(adm), "상한이 없다");
  // 💰 큰 컬럼 접촉 금지 — 관제탑 조회가 raw_reviews·synth_reviews_all을 읽으면 비용이 튄다.
  for (const big of ["raw_reviews", "synth_reviews_all", "synth_reviews"]) {
    assert.ok(!adm.includes(big), `관제탑 조회가 큰 컬럼(${big})을 읽는다`);
  }
});

// 🔴 모델은 **요청마다** 넘겨야 한다 — 2026-10-19 실사고.
//   `JUDGE_MODEL` 환경변수는 그 값을 읽는 **프로세스**의 것이다. 판정 제출은 라우트(서버)가 하고
//   집행기(judge-run.mjs)는 curl로 그 라우트를 부른다 → `JUDGE_MODEL=... node judge-run.mjs`는
//   **서버에 전달되지 않는다.** judge-full-coverage.sh가 구간별 모델을 넘겼는데 서버는 기본값
//   (claude-haiku-4-5)으로 제출했다. "thin은 Sonnet 5"라는 보고가 거짓이 됐고 5배 비싼 구형으로 샀다.
test("판정 모델: 라우트가 요청 파라미터로 모델을 받고, 모르는 단가는 거부한다", () => {
  const route = codeOf("../../app/api/cron-batch-judge/route.ts");
  assert.ok(/searchParams\.get\("model"\)/.test(route), "라우트가 model 파라미터를 받지 않는다");
  assert.ok(/!BATCH_PRICES\[reqModel\]/.test(route), "단가표에 없는 모델을 거부하지 않는다 — 예산 가드가 거짓이 된다");
  assert.ok(/model: MODEL,/.test(route), "제출에 요청 모델을 쓰지 않는다");
  assert.ok(/model: MODEL \}/.test(route), "매니페스트에 요청 모델을 기록하지 않는다 — 수거 시 단가가 틀어진다");
});
test("판정 모델: 집행기가 model을 쿼리로 넘긴다(환경변수에 의존하지 않는다)", () => {
  const runner = codeOf("../../scripts/judge-run.mjs");
  assert.ok(/&model=\$\{encodeURIComponent\(MODEL\)\}/.test(runner), "집행기가 model을 쿼리로 넘기지 않는다");
});

// 🔴 배포는 **사용자 화면까지** 가야 끝이다 — 2026-10-19 실사고.
//   `/c/[id]`는 ISR 30일이라 배포해도 **이미 캐시된 페이지는 옛 HTML을 그대로 내보낸다.**
//   사용자 피드백 바를 배포했는데 대부분의 카페 페이지에서 보이지 않았다. 내가 확인한 한 곳이
//   마침 재생성된 페이지라 "프로덕션 작동 확인"이라고 잘못 보고했다(표본 1개로 단정).
//   → 자동 배포가 푸시 뒤 **상세 라우트 캐시를 비운다.** 이 단계가 빠지면 같은 사고가 반복된다.
//   💰 무효화는 쓰기 0이고 재생성은 방문 시에만 → 실측 30일 방문 8,853곳 = 평상시 월간의 17.8%.
//      총량이 느는 게 아니라 30일 주기를 앞당기는 것이다.
test("배포: 자동 배포가 푸시 뒤 상세 라우트 캐시를 비운다", () => {
  const sh = readFileSync(new URL("../../scripts/dawn-deploy.sh", import.meta.url), "utf8");
  const iPush = sh.indexOf("git push origin main");
  const iPurge = sh.indexOf("api/purge-detail-route");
  assert.ok(iPush > 0, "푸시 단계가 없다");
  assert.ok(iPurge > 0, "캐시 무효화 단계가 없다 — UI 변경이 사용자 화면에 가지 않는다");
  assert.ok(iPush < iPurge, "무효화가 푸시보다 먼저다 — 빌드 전에 비우면 옛 HTML이 다시 캐시된다");
});
test("배포: 무효화 엔드포인트는 라우트 전체를 한 번에 비우고 인증을 요구한다", () => {
  const api = codeOf("../../app/api/purge-detail-route/route.ts");
  assert.ok(/CRON_SECRET/.test(api) && /status: 401/.test(api), "인증이 없다");
  assert.ok(/revalidatePath\(route, type\)/.test(api), "라우트 단위 무효화를 쓰지 않는다");
  assert.ok(/"\/c\/\[id\]", "page"/.test(api), "상세 라우트를 비우지 않는다");
});

// 💰 ISR 쓰기 관문(2026-10-19) — **이 세션 실사고**: 상세 페이지가 `new Date()`로 "오늘 날짜 확인"을 찍고 있었다.
//   Vercel 공식: "재검증 결과가 이전과 같으면 쓰기 단위가 발생하지 않는다. 예상 못한 쓰기가 보이면
//   ISR 출력에 new Date()·Math.random() 같은 비결정 코드가 있는지 보라." 날짜는 매일 바뀌니
//   **재생성할 때마다 내용이 달라져 쓰기가 영구 과금**됐다(상세 1쪽 98KB = 쓰기 13단위 × 공개 49,874쪽).
//   대량 ISR 라우트에 같은 함정이 다시 들어오면 여기서 막는다.
test("ISR: 대량 캐시 라우트에 날짜·난수 같은 비결정 출력이 없다", () => {
  const routes = [
    "../../app/c/[id]/page.tsx",
    "../../app/area/[gu]/page.tsx",
    "../../app/area/[gu]/[taste]/page.tsx",
    "../../app/area/[gu]/dong/[dong]/page.tsx",
    "../../app/area/[gu]/dong/[dong]/[taste]/page.tsx",
    "../../app/area/[gu]/f/[facet]/page.tsx",
    "../../app/area/[gu]/dong/[dong]/f/[facet]/page.tsx",
    "../../app/share/[id]/page.tsx",
  ];
  for (const r of routes) {
    // 메모이즈 TTL(`axisDistMem`)은 출력이 아니라 서버 메모리 수명이라 예외다 — 그 줄만 걷어낸다.
    const code = codeOf(r).split("\n").filter((l) => !/Mem\b/.test(l)).join("\n");
    assert.ok(!/new Date\(\)/.test(code), `${r}: new Date()가 ISR 출력에 섞이면 매 재생성마다 쓰기가 과금된다`);
    assert.ok(!/Date\.now\(\)/.test(code), `${r}: Date.now()가 ISR 출력에 섞이면 매 재생성마다 쓰기가 과금된다`);
    assert.ok(!/Math\.random\(\)/.test(code), `${r}: Math.random()은 재생성마다 다른 HTML을 만든다`);
  }
});
test("ISR: 상세 '확인' 날짜는 렌더 시각이 아니라 검증 시각(synth_checked_at)이다", () => {
  const code = codeOf("../../app/c/[id]/page.tsx");
  assert.ok(/c\.synth_checked_at/.test(code), "SELECT에 synth_checked_at이 없다");
  assert.ok(/const checkedT = c\.synth_checked_at/.test(code), "검증 시각을 기준으로 쓰지 않는다");
  assert.ok(/checkedOn \? `/.test(code), "값이 없을 때 빈 날짜가 화면에 찍힌다");
});
