// 🛡️ 근거 합치기·급감 차단 — **순수 함수**(DB·네트워크 미접촉). 2026-10-18 분리.
//
// 왜 분리했나: 이 두 로직은 10-17 사고의 수리 지점이다.
//   재수집이 누적 원본을 덮어써 공개 카페 2곳의 검증 후기가 **171→36 · 100→68**로 깎였다(복구 불가).
//   합치기로 원인을 막고 급감 차단기를 세웠는데, 둘 다 `synthStore`의 긴 함수 안에 박혀 있어
//   **테스트가 불가능**했다. 서비스 최대 자산(원본 근거)을 지키는 코드가 자물쇠 없이 돌고 있었던 셈이다.
//   → 로직을 그대로 들어내 순수 함수로 만들고 `lib/__tests__/moat.test.ts`로 못을 박는다.
//   ⚠️ 동작은 한 줄도 바꾸지 않았다(분리만). 바꾸려면 테스트가 먼저 깨져야 한다.

export type EvidenceItem = {
  source: "google" | "blog" | "youtube";
  text: string; title?: string; desc?: string; time?: number; link?: string; date?: string; srcName?: string;
};

// 같은 글 판별 키 — 링크가 진실원본이고, 링크가 없으면 출처+제목+본문 앞머리로 대신한다.
//   (네이버 블로그 링크는 안정적이라 링크가 있으면 그게 가장 정확하다.)
export function evidenceKey(r: EvidenceItem): string {
  return r.link ? `L:${r.link}` : `T:${r.source}|${(r.title || "").slice(0, 60)}|${(r.text || "").slice(0, 120)}`;
}

/**
 * 누적 근거(prev) ∪ 새 수집(fetched). **기존을 절대 버리지 않는다** — 상한을 넘을 때만 오래된 것부터 잘린다.
 *
 * 규칙(10-17 수리에서 확정):
 *   ① 기존을 먼저 깔고 새것으로 덮는다 → 같은 글은 **새 판본**이 이긴다(본문이 갱신될 수 있다).
 *   ② 날짜 내림차순 정렬. **날짜 없는 항목은 맨 뒤**로 보낸다(상한에서 먼저 잘리는 쪽).
 *   ③ `keepMax`까지만 남긴다 — raw는 큰 컬럼이라 무한 누적이 그대로 조회비용이 된다(비용 하드규칙).
 *      실측(2026-10-18): 원본 보유 71,361곳 중 상한(600) 도달 523곳 · 날짜 없는 항목 0.0%
 *      → 지금은 사실상 '가장 오래된 것부터' 잘린다.
 */
export function mergeRawEvidence(prev: EvidenceItem[], fetched: EvidenceItem[], keepMax: number): EvidenceItem[] {
  if (!prev.length) return fetched;
  const byKey = new Map<string, EvidenceItem>();
  for (const r of prev) byKey.set(evidenceKey(r), r);      // 기존을 먼저 깔고
  for (const r of fetched) byKey.set(evidenceKey(r), r);   // 같은 글은 새 판본으로 덮는다
  const all = [...byKey.values()];
  all.sort((a, b) => {
    const ta = a.date ? Date.parse(String(a.date)) : NaN;
    const tb = b.date ? Date.parse(String(b.date)) : NaN;
    if (Number.isFinite(ta) && Number.isFinite(tb)) return (tb as number) - (ta as number);
    if (Number.isFinite(tb)) return 1;
    if (Number.isFinite(ta)) return -1;
    return 0;
  });
  return all.slice(0, keepMax);
}

/**
 * 공개 카페의 근거가 한 번에 꺾이는 쓰기를 막는다(10-17 사고의 진짜 구멍 = "줄어드는 쓰기를 거부하는 관문 없음").
 *
 *   · 대상: **지금 공개 중**이고 기존 후기가 `minCount`건 이상인 카페만
 *          (신규·미공개는 자연 변동이 커서 대상에서 뺀다 — 오탐이 수집을 멈추게 하면 안 된다)
 *   · 임계: 새 수치가 기존의 `ratio` 미만이면 쓰지 않는다(기존 화면 그대로 유지)
 *   · 정상적인 감소(폐업·오염 정리)는 CEO 결재나 전용 힐러가 집행한다 — 수집 경로가 할 일이 아니다.
 */
export function shouldBlockShrink(a: {
  wasPublished: boolean; prevCount: number; newCount: number; minCount: number; ratio: number;
}): boolean {
  return a.wasPublished && a.prevCount >= a.minCount && a.newCount < a.prevCount * a.ratio;
}
