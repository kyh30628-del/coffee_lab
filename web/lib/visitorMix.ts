// 🧳🏠 방문객 성격 — "이 후기를 쓴 사람들이 여행자였나, 동네 사람이었나".
//
// 왜 만드나 (2026-08-25, CEO 지시):
//   강원 확장을 검토하다 "관광지가 많으면 '동네 커피 노트' 정체성이 흐려지지 않나"라는 질문이 나왔다.
//   실측해보니 그 걱정은 **강원 문제가 아니었다** — 수도권 공개 카페에도 이미 같은 축이 있었다.
//     · 인천 옹진군 평균 여행신호 13.4% · 가평군 12.4% · 강화군 9.5%
//     · 대부도 빵집·범산목장 왕산해수욕장점·마리웨일237 파주프로방스점 …
//   우리는 관광지 카페를 **라벨 없이 이미 공개해 왔다**. 없던 축을 이제 만드는 것이지, 강원 딱지가 아니다.
//
// ⚠️ 설계 원칙 — 카페가 아니라 **근거**를 판정한다:
//   CEO 지적이 정확했다. "누군가한테는 관광지지만 거기 사는 사람들은 본인들 동네다."
//   남이섬 북카페 후기의 여행신호가 높은 건 *그 카페가 관광지라서*가 아니라 *후기 쓴 사람 다수가 관광객*이라서다.
//   그래서 라벨 문구도 "관광지 카페"가 아니라 "여행 와서 들른 후기가 많아요"다. 카페에 딱지를 붙이지 않는다.
//   같은 이유로 두 배지는 **서로 배타적이지 않다** — 둘 다 붙을 수도, 둘 다 안 붙을 수도 있다.
//
// 🎚️ 관광 배지는 보수적으로(CEO 명시). 오탐 = 동네 카페에 관광지 낙인 = 손상이 크다.
//   임계 보정 실측(수도권 공개 표본 2,000곳):
//     표본10건+10% → 77곳(4.9%), 동네신호도 높은 '오탐후보' 7곳
//     표본15건+15% → 22곳(1.6%), 오탐후보 0곳
//     표본15건+20% → 10곳(0.7%), 오탐후보 0곳  ← 채택
//   채택안 대상은 전부 실제 목적지형이었다(양평빵나들이 여행 100%·가평 물의정원·왕산해수욕장점·강화 MARU).
//
// 💰 비용 0: 합성 시점에 **이미 메모리에 있는 인용문**에 정규식 한 번. 추가 조회·LLM 없음(standoutBadge와 같은 원칙).
import { getCriterionSync } from "./criteria";

// 여행 신호: 일회성·목적지 방문 어휘. '코스'·'휴가'는 일상 문맥('수업 코스'·'휴가 냈다')과 겹쳐 제외했다.
const TRIP = /(여행|놀러|나들이|드라이브|여행객|관광객|당일치기|1박|2박)/;
// 동네 신호: 반복 방문·생활권 관계. 이게 우리 서비스의 정체성 그 자체다.
const LOCAL = /(단골|자주\s?가|자주\s?들르|또\s?왔|또\s?가|재방문|동네|집\s?앞|집\s?근처|퇴근|출근|근처\s?살)/;

// 🚨 상호 오탐 차단(2026-08-25, 배포 전 실측으로 발견):
//   후기에는 카페 이름이 자주 등장한다. 그래서 **상호에 신호어가 들어간 카페**는 신호가 100%로 튄다 —
//   '단골커피' 19건 중 동네 100% · '우리동네식빵' 22건 중 100% · '걸리버여행기' 43건 중 여행 79%.
//   실측 규모: 상호에 동네어 98곳(그중 배지 오탐 21곳) · 여행어 7곳(오탐 1곳).
//   교정 원리 = **그 카페에 한해 해당 축을 판정하지 않는다**(0으로 두어 배지가 안 붙게).
//   억지로 이름만 지워서 재는 것보다 안전하다 — '동네커피'의 후기에서 '동네'가 상호를 가리키는지
//   진짜 동네를 가리키는지 규칙으로는 가를 수 없기 때문(모르면 붙이지 않는다).
export type VisitorMix = { n: number; trip: number; local: number };
export type VisitorBadge = { key: "trip" | "local"; emoji: string; label: string; note: string };

// 인용문 배열 → 비율. 표본이 적으면 비율이 요동치므로 판정(badges)에서 표본 하한을 건다.
export function visitorMix(quotes: string[], cafeName = ""): VisitorMix {
  const qs = (quotes || []).filter(Boolean);
  if (!qs.length) return { n: 0, trip: 0, local: 0 };
  // 상호가 그 축의 신호어를 품고 있으면 그 축은 판정하지 않는다(위 주석 참조).
  const nameHasTrip = TRIP.test(cafeName), nameHasLocal = LOCAL.test(cafeName);
  const trip = nameHasTrip ? 0 : qs.filter((q) => TRIP.test(q)).length / qs.length;
  const local = nameHasLocal ? 0 : qs.filter((q) => LOCAL.test(q)).length / qs.length;
  return { n: qs.length, trip, local };
}

// 저장된 비율 → 표시 배지. 임계는 criteria 단일출처(폴백=코드 DEFAULTS와 동일).
//   ⚠️ 프록시 지표다. 단정 문구('관광지입니다') 금지 — 근거 서술로만 쓴다(빨강 금지 원칙과 같은 결).
export function visitorBadges(mix: VisitorMix): VisitorBadge[] {
  const out: VisitorBadge[] = [];
  if (mix.n >= getCriterionSync("visitor.trip.min_sample") && mix.trip >= getCriterionSync("visitor.trip.rate"))
    out.push({ key: "trip", emoji: "🧳", label: "여행 와서 들른 후기가 많아요", note: `후기 ${mix.n}건 중 ${Math.round(mix.trip * 100)}%` });
  if (mix.n >= getCriterionSync("visitor.local.min_sample") && mix.local >= getCriterionSync("visitor.local.rate"))
    out.push({ key: "local", emoji: "🏠", label: "동네 단골 후기가 있어요", note: `후기 ${mix.n}건 중 ${Math.round(mix.local * 100)}%` });
  return out;
}
