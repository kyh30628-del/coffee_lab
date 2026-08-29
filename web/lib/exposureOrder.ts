import { quoteMatchConfidence, detectCampaignCluster } from "./reviewQuality";
import { ownBranch, isOtherBranchQuote } from "./branchQuote";
import { isAdTemplateQuote } from "./adTemplate";

// 👁️ 노출 정렬 단일 출처 — 하네스 L5(노출 감시).
//
// 왜 옮겼나(2026-08-08): 이틀 사이 CEO가 **직접** 잡아낸 두 문제(피기스터하우스에 돈제당 식당 후기,
//   쉐프부랑제 사우점에 운양점 후기)는 **데이터가 아니라 화면에 나가는 순서** 문제였다. 데이터는 깨끗했고
//   오염 스캐너도 정상이었다. 즉 "사용자가 실제로 무엇을 보는가"를 보는 주체가 조직에 없었다.
//   → 감시자가 소비자 API와 **같은 함수**를 쓰도록 여기로 승격한다. 두 곳이 갈라질 수가 없게.

// 리뷰 게시일 파싱(YYYY.MM.DD / YYYY-MM / YYYY년 MM월 등) → ms
function parseYmd(d?: string): number | null {
  if (!d) return null;
  const m = String(d).match(/(\d{4})[.\-/년\s]+(\d{1,2})(?:[.\-/월\s]+(\d{1,2}))?/);
  if (!m) return null;
  const t = new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 15).getTime();
  return isNaN(t) ? null : t;
}
// 최신성 보너스(0~45): 이번 달 45, 이후 월 2점씩 감쇠, 날짜미상 12(중립). 최신성을 강하게 반영.
function recencyBonus(d: string | undefined, nowT: number): number {
  const t = parseYmd(d);
  if (t == null) return 12;
  const months = (nowT - t) / 2.63e9;
  if (months <= 1) return 45;
  return Math.max(0, 45 - months * 2);
}
// 정확도(score) — 후기 한 건의 판정 정확도 수치(0~100). 등급 다음가는 정렬 기준(CEO 2026-08-05).
function accuracy(e: any): number {
  return typeof e?.score === "number" ? e.score : 50;
}
// 신뢰등급 티어 — 노출 우선순위의 최상위 기준. verified(검증)=그 카페가 글의 주제인 진짜 방문기,
//   reference(참고)=본문에 이름만 스친 약한 근거(옆가게·다른 맛집 글에 "맞은편 카페 ○○도" 식 언급).
function trustTier(e: any): number {
  return e?.trust === "verified" ? 2 : e?.trust === "reference" ? 1 : 0;
}
// 노출 정렬(CEO 확정 2026-08-05) — **①신뢰등급(검증 > 참고 > 그 외) ②같은 등급 안에서 정확도(score) 높은 순**
//   ③동점이면 최신순 ④그래도 동점이면 안정 타이브레이크. 검증 등급은 무조건 최우선으로 노출된다.
// ⚠️ 단 하나의 선행 관문 = 카페명 매칭 확신도(quoteMatchConfidence, 0/1). conf=0 = 인용문에 이 카페 이름조차
//   안 맞는 '다른 카페 의심' 건이라 등급과 무관하게 맨 뒤로 내린다(#307 '카페 여유'에 붙은 '노아브런치카페'
//   오염이 최상단을 차지한 사고의 방어선 — 저장 시점 등급만 믿으면 재발한다). 실제 데이터의 절대다수는
//   conf=1이라 이 관문은 오염 의심분만 걸러내고, 나머지 전부에 위 ①②③이 그대로 적용된다.
// 배경(CEO "피기스터하우스에 돈제당 리뷰가 6건 안에"): 예전 정렬은 conf→최신순이었는데 conf가 사실상 전건 1이라
//   '최신순'만 남아, 참고 등급(약한 근거)이 검증 후기를 밀어내고 대표 6칸을 차지했다(14075: 6칸 중 4칸).
//   전수 실측: 공개 13,460곳 중 9,927곳이 대표 6건에 참고를 노출, 그중 8,339곳은 아래에 검증 후기가 대기 중이었다.
// 🏪 두 번째 선행 관문(2026-08-08, CEO 선택안 C) — **다른 지점 후기**도 conf와 같은 급으로 뒤로 민다.
//   '쉐프부랑제 사우점' 상세에 '운양동 …쉐프부랑제 방문기'가 대표 6건에 뜨던 문제(센티넬 지점오염 22곳).
//   삭제하지 않는 이유: 한 글이 두 지점을 함께 다루는 경우가 흔해 지우면 정상 후기가 죽는다. 순서만 바꾼다.
//   ⚠️ 형제 지점 목록 조회 없음 — 카페 이름 하나로만 판정해 **추가 DB 비용 0**.
export function sortReviews(raw: any[], name: string, areaTerms: string[], nowT: number, dong?: string | null): any[] {
  const own = ownBranch(name, dong);
  // 🚩 네 번째 선행 관문(2026-08-17) — **미표기 체험단 캠페인**을 뒤로 민다.
  //   지금까지 detectCampaignCluster는 탐지만 하고 needs_llm_priority 텍스트만 남겼다(집행 없음).
  //   LLM 크레딧이 없어도 캠페인 판정 자체는 결정론이라, 노출 순서로는 지금 바로 집행할 수 있다.
  //   실제 사례 '카페 여백'(#304): 후기 32건 중 21건이 이틀에 몰리고 개인서사 0%, 자동생성 블로그 계정.
  //   ⚠️ 삭제·비공개가 아니라 순서만 바꾼다 — 오탐이 나도 후기는 사라지지 않는다(광고템플릿 관문과 같은 원칙).
  //   비용: 실측 카페당 0.12ms(후기 120건 기준)·추가 DB 조회 0.
  const camp = detectCampaignCluster(raw.map((e) => ({ quote: e?.quote || "", date: e?.date })));
  const campDay = camp.suspect && camp.clusterDate ? new Date(camp.clusterDate + "T00:00:00").getTime() : null;
  const inCampaign = (e: any): boolean => {
    if (campDay == null) return false;
    const t = parseYmd(e?.date);
    return t != null && Math.abs(t - campDay) <= 36 * 3600 * 1000; // ±1일(밀집 병합 기준과 동일)
  };
  return [...raw]
    .map((e) => ({
      e,
      conf: quoteMatchConfidence(name, e?.quote || "", areaTerms),
      mine: own && isOtherBranchQuote(e?.quote || "", own) ? 0 : 1, // 0 = 다른 지점 글 → 맨 뒤
      // 🏷️ 세 번째 선행 관문(2026-08-16, CEO 지시 A) — 광고 대행 템플릿(업체 정보 카드)을 뒤로 민다.
      //   협찬 공시는 글 끝에 붙는데 우리가 받는 건 앞부분 스니펫뿐이라 공시어 규칙엔 사각이 있다.
      //   → 공시 대신 '지문'(영업시간·주차·전화번호 나열 + 개인 감상 전무)으로 판정한다.
      //   삭제가 아니라 순서만 바꾸므로 오탐이 나도 후기는 사라지지 않는다. 추가 DB 조회 0.
      real: isAdTemplateQuote(e?.quote) ? 0 : 1, // 0 = 정보 카드형 → 진짜 후기 뒤로
      solo: inCampaign(e) ? 0 : 1,               // 0 = 캠페인 묶음 글 → 뒤로
    }))
    .sort((a, b) => {
      if (b.conf !== a.conf) return b.conf - a.conf;
      if (b.mine !== a.mine) return b.mine - a.mine;
      if (b.real !== a.real) return b.real - a.real;
      if (b.solo !== a.solo) return b.solo - a.solo;
      const tier = trustTier(b.e) - trustTier(a.e);
      if (tier !== 0) return tier;
      // 🔴 2026-08-28 수리(CEO: "최신의 오염 없이 검증된 리뷰를 노출"):
      //   최신성이 **맨 마지막 타이브레이커**라, score가 1점만 달라도 3년 전 글이 올해 글을 이겼다
      //   (실측: 더 최신 검증후기가 있는데 옛 글만 표시된 카페 8,243곳).
      //   → 오염 방어(확신도·내가게·실방문·단독·신뢰등급)는 **순서 그대로 우선**, 그 아래에서만
      //     정확도와 최신성을 **합산**해 겨룬다. 품질 기준을 낮추는 게 아니라, 같은 자격이면 최신이 이긴다.
      // 신뢰등급(trustTier)은 이미 위에서 갈렸다. 여기서 정확도와 최신성을 합산하면 **검증 후기가
      //   참고 후기에 밀리는 일은 없지만**, 정확도 높은 검증글이 최신 검증글에 밀려 상위6에서 빠지며
      //   검증 후기 '개수'가 줄었다(실측 300곳 중 15곳). → 합산은 폐기.
      //   대신 **최신은 확실히 한 자리를 갖는다**: 정렬은 정확도 우선 그대로 두고,
      //   호출부에서 상위6 중 1칸을 '최근 1년 검증 후기'에 예약한다(품질 무손실·최신 보장).
      // 🔴 2026-08-29 재수리(CEO 지적: 메이트힐이 아직도 2023년 글만 보임).
      //   어제 수리(ensureRecent)는 "상위6에 최신이 없으면 6번째 자리에 하나 끼워넣기"였다.
      //   기술적으로는 작동했지만 **화면에서는 소용이 없었다** — 사용자는 2023년 글 다섯 개를 먼저 보고
      //   "최신이 없네"라고 판단한다. 통계(개선 30·악화 0)만 보고 완료라고 보고한 게 잘못이었다.
      //   실측(메이트힐 24038): 2023년 글 score 100 vs 2026년 글 score 79 — 21점 차라 최신성이
      //   맨 끝 타이브레이커로는 **영원히 발동하지 못한다.**
      //   → 점수와 최신성을 **합산**해 같은 등급 안에서 겨루게 한다.
      //   ⚠️ 안전 근거: 이 비교는 trustTier(검증>참고>기타) **아래**에 있다. 등급은 이미 위에서 갈렸으므로
      //     참고 후기가 검증 후기를 밀어낼 수 없다 = 상위6의 '검증 후기 개수'는 수학적으로 불변이다.
      //     (지난번 합산 시도가 검증 개수를 줄인 건 등급보다 위에서 합산했기 때문이다.)
      const merit = (x: any) => accuracy(x) + recencyBonus(x?.date, nowT);
      return merit(b.e) - merit(a.e);
    })
    .map(({ e }) => e);
}


/**
 * 🆕 2026-08-28 — 상위 N칸 중 **1칸을 '최근 1년' 후기에 예약**한다(CEO: 최신의 검증된 리뷰를 노출).
 *   품질 무손실 설계: 정렬(sortReviews) 결과에서 **가장 앞선 최근 1년 후기**를 끌어올릴 뿐,
 *   신뢰등급·정확도 판정을 바꾸지 않는다. 이미 상위 N에 최근 1년 글이 있으면 아무것도 안 한다.
 *   (합산 가중치 방식은 검증 후기 수가 줄어드는 부작용이 실측돼 폐기했다.)
 */
export function ensureRecent<T extends { date?: string; trust?: string }>(sorted: T[], n = 6, nowT = Date.now()): T[] {
  if (sorted.length <= n) return sorted;
  // ⚠️ 끌어올릴 대상은 **'검증' 등급 + 최근 1년**만. 참고 등급을 올리면 상위6의 검증 후기 수가
  //   줄어든다(실측 300곳 중 14곳). CEO 요구는 "최신의 **오염 없이 검증된** 리뷰"다 — 둘 다 만족해야 한다.
  const isRecent = (e: T) => {
    if (e?.trust !== "verified") return false;
    const t = parseYmd(e?.date); return t != null && (nowT - t) < 365 * 86400000;
  };
  // 이미 상위6에 '검증+최근1년'이 있으면 손대지 않는다.
  const top = sorted.slice(0, n);
  if (top.some(isRecent)) return sorted;
  const idx = sorted.findIndex((e, i) => i >= n && isRecent(e));
  if (idx < 0) return sorted;
  const picked = sorted[idx];
  return [...top.slice(0, n - 1), picked, ...sorted.slice(n).filter((_, i) => i !== idx - n), top[n - 1]];
}
