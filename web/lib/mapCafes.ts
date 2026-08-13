// 지도·목록 응답(/api/cafes)의 char_scores 압축 규약 — **서버와 클라이언트의 단일 출처**.
// 6축을 키 이름 없이 고정 순서 배열 `cs`로 실어 보내 전송량을 줄인다(이 항목 하나가 응답의 26%였다).
// 순서를 바꾸면 취향 필터·정렬·유사도가 통째로 뒤섞이므로, 반드시 여기서만 고칠 것.
export const CAFE_AXES = ["roast", "work", "quiet", "dessert", "mood", "space", "pet", "brunch", "view"] as const;

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
