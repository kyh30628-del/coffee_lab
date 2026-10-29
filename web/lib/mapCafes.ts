// 지도·목록 응답(/api/cafes)의 char_scores 압축 규약 — **서버와 클라이언트의 단일 출처**.
// 6축을 키 이름 없이 고정 순서 배열 `cs`로 실어 보내 전송량을 줄인다(이 항목 하나가 응답의 26%였다).
// 순서를 바꾸면 취향 필터·정렬·유사도가 통째로 뒤섞이므로, 반드시 여기서만 고칠 것.
export const CAFE_AXES = ["roast", "work", "quiet", "dessert", "mood", "space", "pet", "brunch", "view", "bakery", "terrace"] as const;

export function encodeCharScores(cs: Record<string, number> | null | undefined): number[] | undefined {
  if (!cs) return undefined;
  return CAFE_AXES.map((k) => Number(cs[k] ?? 0));
}

// 받은 목록을 원래 모양(char_scores 객체)으로 되돌린다 — 소비 코드는 예전 그대로 쓰면 된다.
export function decodeCafeScores<T extends { cs?: number[]; char_scores?: Record<string, number> | null }>(list: T[]): T[] {
  return list.map((c) => {
    if (!Array.isArray(c?.cs)) return c;
    const char_scores: Record<string, number> = {};
    CAFE_AXES.forEach((k, i) => { char_scores[k] = Number(c.cs![i] ?? 0); });
    const { cs: _drop, ...rest } = c;
    return { ...(rest as T), char_scores };
  });
}

// 🧩 지도 데이터 조각 수(2026-10-10) — Vercel CDN은 10MB 넘는 응답을 캐시하지 않는다(미리보기 실측: 9MB HIT·14.9MB MISS).
//   조각 = id % MAP_PARTS. 서버(app/api/cafes)와 아래 fetchMapCafes가 이 값 하나를 함께 쓴다.
export const MAP_PARTS = 4;

type MapCafeRaw = { id: number | string; note?: string; synth_count?: number | null };

// 서버 원래 순서(메모 있는 곳 먼저 → 후기 수 많은 순)를 조각을 합친 뒤 똑같이 재현한다. 동률은 id로 고정.
function byServerOrder(a: MapCafeRaw, b: MapCafeRaw): number {
  const na = a.note ? 1 : 0, nb = b.note ? 1 : 0;
  if (na !== nb) return nb - na;
  const ca = a.synth_count ?? -1, cb = b.synth_count ?? -1;
  if (ca !== cb) return cb - ca;
  return Number(a.id) - Number(b.id);
}

const fetchPart = (k: number) =>
  fetch(`/api/cafes?part=${k}`).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });

function mergeParts(ds: any[]): MapCafeRaw[] | null {
  if (!ds.every((d, k) => d?.ok && d.part === k && d.parts === MAP_PARTS && Array.isArray(d.cafes))) return null;
  const seen = new Set<string>();
  const all: MapCafeRaw[] = [];
  for (const d of ds) for (const c of d.cafes as MapCafeRaw[]) {
    const key = String(c.id);
    if (!seen.has(key)) { seen.add(key); all.push(c); }
  }
  return all.length > 0 ? all : null;
}

/** 지도용 공개 카페 전량. 조각 4개를 병렬로 받아 합치고, 하나라도 실패하면 전체 응답 1개로 되돌아간다(화면은 절대 비지 않게).
 *  🔴 2026-10-30 비용 사고 수리 — pg_stat_statements 실측: 이 함수의 **전체 응답 폴백**(캐시 전혀 안 걸리는 경로, 매번
 *  공개 카페 전량 5만여 행 Neon 직결)이 11.6일간 2,613회 불려 시스템 전체 전송 1위였다. 조각 4개 중 **하나만 일시
 *  실패해도**(Promise.all이 전부를 reject) 곧바로 이 비싼 길로 떨어졌다 — 저트래픽 사이트라 각 조각이 식어
 *  있을 때가 많아 실제로 자주 걸렸다. 전체 폴백 전에 **조각별로 한 번씩만 개별 재시도**를 끼워 넣어,
 *  흔한 '조각 하나만 식음/일시 오류' 케이스는 전체 응답 없이 넘어가게 한다. 화면이 비지 않는 보장은 그대로 유지. */
export async function fetchMapCafes<T = any>(): Promise<T[]> {
  try {
    const ds = await Promise.all(Array.from({ length: MAP_PARTS }, (_, k) => fetchPart(k)));
    const merged = mergeParts(ds);
    if (merged) return merged.sort(byServerOrder) as unknown as T[];
  } catch {}
  try {
    // 조각별 개별 재시도 — 전체(Promise.all) 재시도가 아니라 **실패한 조각만** 다시 받는다.
    const ds = await Promise.all(Array.from({ length: MAP_PARTS }, (_, k) => fetchPart(k).catch(() => fetchPart(k))));
    const merged = mergeParts(ds);
    if (merged) return merged.sort(byServerOrder) as unknown as T[];
  } catch {}
  const d = await (await fetch("/api/cafes")).json();
  return (d?.cafes ?? []) as T[];
}
