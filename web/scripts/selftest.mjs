// 🧪 순수함수 회귀 셀프테스트 — DB 접속 0 · 네트워크 0 · 비용 0.
//   대상 = **실제 사고를 낸 함수들**만. 각 케이스 옆에 사고 이력을 남긴다(왜 지키는지 다음 사람이 알게).
//   사용: node --import tsx scripts/selftest.mjs  (harness-check ⓪에서 자동 실행)
let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) pass++; else { fail++; console.log(`  ❌ ${name}`); } };

// ── searchQuery: 조사절단·지역인식 (사고: '고양이'→'고양시' 오인식, 골든셋 100%→20%)
const { stripParticle, parseQuery, detectRegion, isCoreArea } = await import("../lib/searchQuery.ts");
T("고양이는 절단 금지", stripParticle("고양이") === "고양이");
T("붕어빵이→붕어빵", stripParticle("붕어빵이") === "붕어빵");
T("루프탑에서→루프탑", stripParticle("루프탑에서") === "루프탑");
T("아메리카노 보존", stripParticle("아메리카노") === "아메리카노");
T("불용어 제거(카페·맛집)", !parseQuery("우면동 카페 맛집").tokens.includes("카페"));
T("전부 불용어면 원본 유지(결과0 방지)", parseQuery("좋은 카페 추천").tokens.length > 0);
T("rawTokens 보존(지역판정용)", parseQuery("고양이 있는 카페").rawTokens.includes("고양이"));
const geo = { dong: new Map([["우면동", "서초구"], ["우면", "서초구"], ["고양", "고양시"]]), area: new Set(["서초구", "고양시"]) };
T("우면동→서초구", detectRegion(["우면동"], geo)?.area === "서초구");
T("'고양이'는 지역 아님(장소꼬리 게이트)", detectRegion(["고양이"], geo) === null);
T("성수동카페형 접두+장소꼬리 인정", detectRegion(["우면카페"], geo)?.area === "서초구");
T("연천군=핵심부 아님", !isCoreArea("연천군"));
T("인천 강화군=핵심부 아님", !isCoreArea("인천 강화군"));

// ── branchQuote: 지점 게이트 (사고: 타지점 후기가 상위 노출 — 피기스터하우스/더빈마켓)
const { ownBranch, isOtherBranchQuote } = await import("../lib/branchQuote.ts");
const own = ownBranch("바나타이거 구산점", "구산동");
T("타지점(망원점) 검출", isOtherBranchQuote("[망원 / 카페] 바나타이거 망원점 다녀온 후기", own) === true);
T("본지점은 통과", isOtherBranchQuote("바나타이거 구산점 카페 후기", own) === false);

// ── reviewerProfiles: 계정 추출 (#699 — 잘못 추출하면 프로필 전체 오염)
const { extractRid, looseDate } = await import("../lib/reviewerProfiles.ts");
T("네이버 블로그 ID 추출", extractRid("https://blog.naver.com/abc123/223999") === "naver:abc123");
T("모바일 URL도 추출", extractRid("https://m.blog.naver.com/abc123/2239") === "naver:abc123");
T("PostView형 추출", extractRid("https://blog.naver.com/PostView.naver?blogId=xyz&logNo=1") === "naver:xyz");
T("타 도메인은 null(불이익 없음)", extractRid("https://youtube.com/watch?v=x") === null);
T("느슨한 날짜 파싱", looseDate("20260705") === "2026-07-05");
T("깨진 날짜는 null", looseDate("어제") === null);

// ── charScore: 상호 자기인용 제거 (사고: '고요재' quiet 허위 급등 coord#114)
const { computeCharScores } = await import("../lib/charScore.ts");
const cs = computeCharScores(["최고요! 여기 분위기 좋아요"], "고요재");
T("'최고요'가 quiet로 안 셈", (cs.quiet ?? 0) === 0);
const cs2 = computeCharScores(["리뷰 남겨요 인터뷰도 봤어요"], "아무카페");
T("'리뷰/인터뷰'가 view로 안 셈(#359)", (cs2.view ?? 0) === 0);
const cs3 = computeCharScores(["강아지 동반 가능해서 좋아요 한강뷰도 멋져요"], "아무카페");
T("애견동반·뷰 정탐", (cs3.pet ?? 0) > 0 && (cs3.view ?? 0) > 0);

// ── adTemplate: 광고 대행 템플릿 강등 (사고: 협찬 공시가 스니펫 밖이라 공시어 규칙에 사각)
const { isAdTemplateQuote } = await import("../lib/adTemplate.ts");
T("정보카드형(영업시간+주차+전화) 강등", isAdTemplateQuote("영업시간 매일 10:00-21:00 전화 0507-1111-2222 주차 가능") === true);
T("해시태그 폭탄+영업시간 강등", isAdTemplateQuote("#평택카페 #평택맛집 #평택꼬메 영업시간 8:30~19:00 주차불가") === true);
T("개인 감상 있으면 유지(오탐 방지)", isAdTemplateQuote("주차 가능해서 좋았어요. 디저트도 맛있고 분위기가 아늑합니다") === false);
T("단독 신호는 강등 안 함", isAdTemplateQuote("영업시간 확인하고 방문했습니다 조용한 공간이네요") === false);
T("짧은 문구는 판단 보류", isAdTemplateQuote("주차 가능") === false);
// 2026-08-17 사고: '영업시간'이란 낱말이 없으면 시간표가 대놓고 있어도 신호 0이었다 → 표시 인용문의 10.1%가 미탐.
T("숫자형 시간표+도로명주소 강등", isAdTemplateQuote("카페루엘 서울 마포구 삼개로3길 9 1-2층 10:30-20:00 매주 토/일 정기휴무") === true);
T("공백 낀 시간표도 강등", isAdTemplateQuote("테라로사 코엑스점 서울 강남구 영동대로 513 매일 08 : 00 - 22 : 00 라스트오더") === true);
T("길안내 블록 강등", isAdTemplateQuote("소마드로잉카페 안양점 위치 : 경기도 안양시 만안로 211, 3층 연락처 : ***-****") === true);
// 같은 날 2차 사고: 신호만 넓히고 면제어를 안 넓혀 **진짜 후기**가 걸렸다. 1인칭 경험 어미는 반드시 면제.
T("'가보았어요'는 진짜 후기(면제)", isAdTemplateQuote("남대문 시장 갔다가 새로 생긴 카페가 있어서 가보았어요 주소: 서울 중구 남대문로1길 11-1 08:00-16:00") === false);
// 구조 판정(2026-08-17 3차): 사전을 계속 키우는 대신 **문장 종결어미 2개 이상이면 사람 글**로 본다.
T("종결어미 2개 이상이면 면제(어휘 무관)", isAdTemplateQuote("안녕하세요 야미로그입니다. 오늘 제가 방문한 곳은 더 토트 입니다. 주소 : 서울 종로구 자하문로 2 영업시간 11:00-21:00") === false);
T("명사 나열 정보카드는 종결어미가 없어 그대로 강등", isAdTemplateQuote("패스로스터스 위치 서울 용산구 소월로2길 37 1층 영업시간 월-금 08:00 - 18:00 주차 불가") === true);
T("'먹어봤어요'는 진짜 후기(면제)", isAdTemplateQuote("이천 대산로511 요즘 유행한다는 버터떡 먹어봤어요 이천시 부발읍 대산로 511 8:00-22:00") === false);

// ── 협찬 면책은 항목별로 (사고 2026-08-17: '광고x체험단o'가 '광고x' 하나로 통째 면책 → 체험단 협찬글이 verified/95 노출)
const { verifyReview } = await import("../lib/reviewQuality.ts");
const vr = (title, body) => verifyReview({ name: "크로엔젤 안산사동점", title, body, areaTerms: ["안산시"] }).verdict;
T("'광고x체험단o'는 협찬으로 거절", vr("베이커리 맛집 크로엔젤 안산사동점", "안산에 착륙 크로엔젤 사동점 다녀왔습니다 광고x체험단o #안산카페") === "rejected");
T("'협찬x 내돈내산'은 그대로 통과(오탐 방지)", vr("크로엔젤 안산사동점 방문 후기", "협찬x 내돈내산으로 다녀왔어요. 소금빵이 맛있고 분위기가 좋았습니다 안산시") !== "rejected");
T("'체험단ok'처럼 글자 이어지면 긍정표기 아님", vr("크로엔젤 안산사동점 후기", "광고 아님. 소금빵 먹었어요 맛있었고 재방문 의사 있습니다 안산시") !== "rejected");

// ── workDetail: 카공 시설 신호 — 부정을 못 읽으면 **사실과 정반대**를 말한다(가장 위험한 실패)
const { extractWorkSignals } = await import("../lib/workDetail.ts");
{
  const g = (qs, key) => extractWorkSignals(qs).signals.find((s) => s.key === key);
  T("콘센트 있음 정탐", g(["콘센트도 많고 자리도 좋아요"], "outlet")?.yes === 1);
  T("'콘센트없음'(붙여쓰기) 부정 인식", g(["콘센트없음 테이블 모양은 예쁨"], "outlet")?.no === 1);
  T("'콘센트가 하나도 없어서' 부정 인식", g(["매장에 콘센트가 하나도 없어서 오래 있을 곳은 아니에요"], "outlet")?.no === 1);
  // 구현 중 실제로 밟은 버그: '눈치'를 키워드 앞에서만 찾아 "노트북 눈치 보여서"가 긍정으로 잡혔다.
  T("'와이파이 느리다' 부정 인식", g(["와이파이 느려서 작업은 좀"], "wifi")?.no === 1);
  T("'부족함 없이'는 부정 아님(오탐 방지)", g(["콘센트 부족함 없이 넉넉해요"], "outlet")?.yes === 1);
  T("언급 없으면 아무것도 만들지 않음", extractWorkSignals(["커피가 맛있어요"]).signals.length === 0);
  T("시간제한은 따로 센다", extractWorkSignals(["2시간 이용 제한 있어요"]).timeLimit === 1);
}

// ── detectCampaignCluster: 미표기 체험단 캠페인 (사고: 비율 임계만 있어 700곳 중 0곳만 잡던 구조)
const { detectCampaignCluster } = await import("../lib/reviewQuality.ts");
{
  const dt = (y, m, dd) => `${y}.${String(m).padStart(2, "0")}.${String(dd).padStart(2, "0")}`;
  const campaign = [
    ...Array.from({ length: 8 }, (_, i) => ({ quote: `디저트 맛집 방문 영업시간 10:00-21:00 주차 가능 ${i}`, date: dt(2026, 5, 1) })),
    ...Array.from({ length: 5 }, (_, i) => ({ quote: `커피 마시고 왔어요 ${i}`, date: dt(2025, 3, i + 1) })),
  ];
  const organic = [
    ...Array.from({ length: 8 }, (_, i) => ({ quote: `친구랑 갔는데 케이크가 정말 맛있었어요 ${i}`, date: dt(2026, 5, 1) })),
    ...Array.from({ length: 60 }, (_, i) => ({ quote: `혼자 조용히 책 읽기 좋았습니다 ${i}`, date: dt(2025, 1 + (i % 12), 1 + (i % 28)) })),
  ];
  T("캠페인(동일날짜 8건·템플릿·개인서사0) 검출", detectCampaignCluster(campaign).suspect === true);
  T("자연인기(분산된 68건·개인서사) 보호", detectCampaignCluster(organic).suspect === false);
  T("표본 부족 시 판단보류", detectCampaignCluster([{ quote: "좋아요", date: dt(2026, 5, 1) }]).suspect === false);
}

console.log(`\n🧪 셀프테스트: ${pass} 통과 · ${fail} 실패 ${fail ? "❌" : "✅"}`);
process.exit(fail ? 1 : 0);
