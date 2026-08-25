// ⚖️ 시·도 순환 배치 — "카페 둘러보기"가 수도권에 독식되지 않게 한다. (2026-08-25 CEO 지시)
//
// 문제: 리뷰순·로스팅순 같은 목록은 순수 정렬이라 **후기가 많은 서울·경기가 항상 위**다.
//   강원처럼 늦게 합류한 지역은 아무리 좋은 카페여도 목록에 영영 못 오른다. 공평하지 않다.
//
// 해법 두 겹:
//   ① **인터리브** — 시·도별로 묶어 서울→경기→인천→강원 순으로 한 곳씩 번갈아 뽑는다.
//      각 시·도 '안에서는' 원래 정렬(리뷰순 등)이 그대로라 라벨이 거짓이 되지 않는다.
//   ② **시작점 회전** — 목록이 3~5칸뿐이라 인터리브만으론 강원이 늘 꼴찌다.
//      12시간마다 시작 시·도를 돌려(slot % N) **하루 2회** 바뀐다(2026-08-25 CEO 지시).
//      12시간인 이유: 엔드포인트가 CDN 5분 캐시라 그보다 잦으면 캐시가 무의미해지고,
//      반나절 안에서는 결과가 안정적이라 "새로고침할 때마다 뒤바뀐다"는 혼란도 없다.
//      4개 시·도 기준 이틀이면 한 바퀴를 돈다(하루 1회였을 땐 나흘).
import { SIDO_GU } from "./regionList";

export const SIDO_ORDER = Object.keys(SIDO_GU); // 서울, 경기, 인천, 강원

// area 라벨(예: "강남구"·"인천 미추홀구"·"춘천시") → 시·도.
const GU_TO_SIDO = new Map<string, string>();
for (const [sido, gus] of Object.entries(SIDO_GU)) for (const gu of gus) GU_TO_SIDO.set(gu, sido);

export function sidoOf(area: string): string {
  const a = (area || "").trim();
  if (!a) return "";
  if (a.startsWith("인천")) return "인천"; // area 라벨이 '인천 OO구' 형태
  // 긴 이름 우선(‘동구’⊂‘남동구’ 같은 부분문자열 오분류 방지 — 지도앱 toGu와 같은 원칙)
  const hit = [...GU_TO_SIDO.keys()].sort((x, y) => y.length - x.length).find((gu) => a.includes(gu));
  return hit ? GU_TO_SIDO.get(hit)! : "";
}

/** 회전 슬롯 길이(ms) — 12시간. KST 00:00·12:00에 경계가 떨어진다. */
export const ROTATION_SLOT_MS = 12 * 3600 * 1000;

/** KST 기준 회전 슬롯 번호 — 시작 시·도를 돌리는 데 쓴다(슬롯 안에서는 고정). */
export function kstSlotIndex(now = Date.now()): number {
  return Math.floor((now + 9 * 3600 * 1000) / ROTATION_SLOT_MS);
}

/** 지금 슬롯이 언제 끝나나(ms 타임스탬프) — 관제 화면의 '다음 전환' 표시용. */
export function slotEndsAt(now = Date.now()): number {
  return (kstSlotIndex(now) + 1) * ROTATION_SLOT_MS - 9 * 3600 * 1000;
}

/**
 * 정렬된 목록을 시·도 라운드로빈으로 재배치. 각 시·도 내부 순서는 보존한다.
 * @param cap 최종 개수. 시·도가 모자라면 남은 곳에서 순서대로 채운다(빈칸 없이).
 * @param slotIdx 회전 슬롯(12시간). 관제 화면이 미래 슬롯을 미리 보여줄 때 직접 넘긴다.
 */
export function rotateBySido<T extends { area?: string | null }>(sorted: T[], cap: number, slotIdx = kstSlotIndex()): T[] {
  if (!sorted?.length) return [];
  const groups = new Map<string, T[]>();
  for (const c of sorted) {
    const s = sidoOf(c.area ?? "") || "기타";
    (groups.get(s) ?? groups.set(s, []).get(s)!).push(c);
  }
  // 오늘의 시작 시·도부터 도는 순서. '기타'(미분류)는 항상 맨 뒤로 둔다.
  const present = SIDO_ORDER.filter((s) => groups.has(s));
  const start = present.length ? slotIdx % present.length : 0;
  const order = [...present.slice(start), ...present.slice(0, start), ...(groups.has("기타") ? ["기타"] : [])];

  const out: T[] = [];
  const idx = new Map<string, number>(order.map((s) => [s, 0]));
  let progressed = true;
  while (out.length < cap && progressed) {
    progressed = false;
    for (const s of order) {
      if (out.length >= cap) break;
      const list = groups.get(s)!, i = idx.get(s)!;
      if (i < list.length) { out.push(list[i]); idx.set(s, i + 1); progressed = true; }
    }
  }
  return out;
}
