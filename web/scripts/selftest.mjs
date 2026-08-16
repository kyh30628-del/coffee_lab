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

console.log(`\n🧪 셀프테스트: ${pass} 통과 · ${fail} 실패 ${fail ? "❌" : "✅"}`);
process.exit(fail ? 1 : 0);
