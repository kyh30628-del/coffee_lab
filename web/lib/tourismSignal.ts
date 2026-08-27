// 📰 관광지 판정 — **후기 말투가 아니라 공개된 사실로** 분류한다. (2026-08-25 CEO 지시)
//
// 왜 바꾸나: 기존 🧳 배지는 후기 텍스트의 여행 어휘 비율이었다. 그건 "누가 썼나"를 재는 것이라
//   주관적이고, 후기가 적은 곳은 표본 부족으로 아예 판정이 안 된다.
//   관광지인지 아닌지는 **공적으로 알려진 사실**이다 — 언론이 그 동네를 관광 맥락으로 다루느냐.
//
// 💰 왜 '동(洞) 단위'인가 — 이게 이 설계의 핵심이다:
//   관광지 여부는 카페의 속성이 아니라 **위치의 속성**이다. 카페마다 뉴스를 조회하면 13,710콜
//   (네이버 하루 한도 25,000의 55%)로 쓸 수 없다. 동 단위로 묶으면 **1,207개(4.8%)**로 줄고,
//   한 번 판정하면 그 동에 새 카페가 들어와도 재조회가 필요 없다.
//   ⚠️ 네이버 뉴스는 검색 API와 **같은 25,000 한도를 공유**한다(local·blog와 합산). 배치로만 돌린다.
//
// ⚠️ 판정 원리 — 기사 '수'가 아니라 '비율':
//   기사 수를 쓰면 큰 도시가 무조건 이긴다(춘천이 화천보다 기사가 많다). 그래서 그 동을 다룬 기사 중
//   **관광 맥락 기사의 비율**로 잰다. 도시 크기에 중립적이다.
// ⚠️ 동음이의 방어: '교동'·'중앙동'처럼 흔한 동명은 지역명과 함께 질의하고, 기사 본문에 지역명이
//   실제로 등장하는 기사만 센다. 이게 없으면 다른 지역 기사로 오판한다.

// 2026-08-27 확장: 1차 사전은 속초카페거리(토성면) 3%·봉평면 0%로 변별 실패 — 뉴스가 실제로 쓰는
//   관광 어휘(피서객·휴가철·카페거리·해변·리조트 등)를 보강. ⚠️단독 애매어(방문객 등)는 넣지 않는다.
export const TOURISM_TERMS = /(관광객|관광지|관광명소|명소|여행객|나들이객|나들이|핫플레이스|핫플|유원지|해수욕장|관광단지|드라이브\s?코스|포토존|축제|유명\s?관광|여행\s?코스|관광\s?수요|피서객|휴가철|성수기|여행지|가볼\s?만한|카페\s?거리|해변|바닷가|서핑|스키장|리조트|글램핑|캠핑장|출렁다리|케이블카|둘레길)/;
// 생활권 신호 — 관광 어휘가 섞여도 이쪽이 강하면 관광지로 보지 않는다(주민 대상 기사).
export const LOCAL_NEWS_TERMS = /(주민센터|아파트|재개발|재건축|학군|통학|출퇴근|주민\s?설명회|생활권|택지|입주민|민원)/;

export type Article = { title: string; description: string };
export type TourismSignal = {
  sampled: number;      // 실제로 판정에 쓴 기사 수(지역명이 확인된 것만)
  touristic: number;    // 그중 관광 맥락 기사 수
  residential: number;  // 그중 생활권 맥락 기사 수
  rate: number;         // touristic / sampled
};

const strip = (s: string) => (s || "").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ");

/**
 * 기사 목록 → 관광 신호. 순수 함수(네트워크 없음)라 테스트·캘리브레이션이 쉽다.
 * @param areaHint 지역명(예: "춘천시"). 기사에 이 말이 없으면 동음이의로 보고 **샘플에서 제외**한다.
 */
export function tourismSignal(articles: Article[], areaHint: string, dong: string): TourismSignal {
  const areaCore = (areaHint || "").replace(/(특별자치도|광역시|특별시|도)$/, "").replace(/(시|군|구)$/, "");
  let sampled = 0, touristic = 0, residential = 0;
  for (const a of articles || []) {
    const t = `${strip(a.title)} ${strip(a.description)}`;
    if (!t.trim()) continue;
    // 동음이의 방어 — 지역명(또는 그 핵심어)이 기사에 실제로 나와야 이 동네 기사로 인정.
    if (areaCore && !t.includes(areaCore) && !t.includes(areaHint)) continue;
    // 기사는 행정 접미사를 떼고 쓴다("평창 봉평", "속초 조양") — 정확일치만 요구하면 관광 기사가
    // 표본에서 빠지고 공문서형 기사만 남아 비율이 왜곡된다(2026-08-27 실측). areaCore 동시 요구가 동음이의 방어.
    const dongCore = (dong || "").replace(/(동|면|읍|가)$/, "");
    if (dong && !t.includes(dong) && !(dongCore.length >= 2 && t.includes(dongCore))) continue;
    sampled++;
    if (TOURISM_TERMS.test(t)) touristic++;
    if (LOCAL_NEWS_TERMS.test(t)) residential++;
  }
  return { sampled, touristic, residential, rate: sampled ? touristic / sampled : 0 };
}

// 판정 임계 — 캘리브레이션 전 잠정값. 실측 후 criteria로 옮긴다.
//   ⚠️ 표본이 적으면 비율이 요동친다(기사 2건 중 1건이면 50%). 최소 표본을 반드시 건다.
export const TOURISM_MIN_SAMPLE = 5;
export const TOURISM_RATE = 0.35;

/** 동이 관광지인가 — 결정론 판정. 표본 부족이면 '모름'(false)이지 '아님'이 아니다. */
export function isTouristDong(sig: TourismSignal): boolean {
  if (sig.sampled < TOURISM_MIN_SAMPLE) return false;
  // 생활권 기사가 관광 기사보다 많으면 주민 동네로 본다(재개발·학군 기사가 지배하는 곳).
  if (sig.residential > sig.touristic) return false;
  return sig.rate >= TOURISM_RATE;
}
