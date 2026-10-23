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

// 🔴 2026-10-23 — 옥석(채택된 근거 전체)에 쓰는 **별도의** 아이템 타입과 키.
//   raw(EvidenceItem)는 title/desc/text를 쓰지만, 옥석(EvidenceReview)은 이미 추출된 quote 하나뿐이다
//   — evidenceKey를 그대로 재사용하면 필드가 안 맞는다.
export type GradedEvidence = {
  quote: string; link?: string; source?: string; date?: string; trust?: string; score?: number;
  why?: string[]; k?: string; depth?: number; adStyle?: boolean; listicle?: boolean;
};
function gradedKey(r: GradedEvidence): string {
  return r.link ? `L:${r.link}` : `Q:${(r.quote || "").replace(/\s+/g, "").slice(0, 80)}`;
}

/**
 * 🔴 **급감 차단의 다음 단계**(2026-10-23, CEO "네이버 리뷰는 계속 늘잖아. 효과적으로 가져와야지").
 *
 *   shrinkGuard가 막는 상황의 실제 원인은 두 가지가 섞여 있다 — ① 데이터 손실(10-17 사고 계열, 합치기로 이미 막음)
 *   ② **판정 규칙이 그동안 엄격해져서**, 옛 느슨한 규칙으로 쌓인 평가를 지금 규칙으로 통째 재평가하면 자연히
 *   준다(실측: 트리오드 261→195건 — 네이버 호출 없이 저장된 걸 다시 판정만 해도 준다. 데이터 손실이 아니다).
 *   shrinkGuard는 ①②를 구분 못 하고 둘 다 "쓰지 않는다"로 막아, ②가 섞인 카페는 **새 글이 생겨도 영영 반영이
 *   안 된다** — 재수집의 목적 자체가 무력화된다.
 *
 *   해법: 옛 평가(old)를 **재평가하지 않고 그대로 보존**하고, 새로 돈 평가(fresh)에서 old에 없던(링크 기준)
 *   근거만 **보탠다**. old의 개별 항목은 지금 규칙으로 다시 심사받지 않으므로(= 조부보호), 결과 집합은
 *   정의상 old보다 작아질 수 없다 — shrinkGuard가 막을 이유 자체가 사라진다.
 *   같은 글이 둘 다에 있으면 fresh 판본이 이긴다(본문이 갱신됐을 수 있다 — mergeRawEvidence와 같은 정책).
 *
 *   ⚠️ 전체 재평가(cron-resynth 등 기존 경로)는 건드리지 않는다 — 이 함수는 **급감이 날 때만** 호출되는
 *   별도 경로다. 평상시(급감 없음)는 기존처럼 fresh 결과를 그대로 쓴다.
 */
export function grandfatherEvidence(old: GradedEvidence[], fresh: GradedEvidence[]): GradedEvidence[] {
  const byKey = new Map<string, GradedEvidence>();
  for (const r of old) byKey.set(gradedKey(r), r);     // 옛 평가를 먼저 깔고(보존)
  for (const r of fresh) byKey.set(gradedKey(r), r);   // 같은 글만 새 판본으로 덮는다 — old에 없던 글은 추가됨
  return [...byKey.values()];
}

/** 조부보호 결과(union, 순서 무관)에서 "표시용 상위 N건"만 추린다 — 최신순(mergeRawEvidence와 같은 정렬 정책). */
export function pickRecentTop(items: GradedEvidence[], n: number): GradedEvidence[] {
  const sorted = [...items].sort((a, b) => {
    const ta = a.date ? Date.parse(String(a.date)) : NaN;
    const tb = b.date ? Date.parse(String(b.date)) : NaN;
    if (Number.isFinite(ta) && Number.isFinite(tb)) return (tb as number) - (ta as number);
    if (Number.isFinite(tb)) return 1;
    if (Number.isFinite(ta)) return -1;
    return 0;
  });
  return sorted.slice(0, n);
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
