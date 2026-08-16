import { quoteMatchConfidence } from "./reviewQuality";
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
    }))
    .sort((a, b) => {
      if (b.conf !== a.conf) return b.conf - a.conf;
      if (b.mine !== a.mine) return b.mine - a.mine;
      if (b.real !== a.real) return b.real - a.real;
      const tier = trustTier(b.e) - trustTier(a.e);
      if (tier !== 0) return tier;
      const acc = accuracy(b.e) - accuracy(a.e);
      if (acc !== 0) return acc;
      return recencyBonus(b.e?.date, nowT) - recencyBonus(a.e?.date, nowT);
    })
    .map(({ e }) => e);
}

