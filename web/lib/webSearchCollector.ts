// 구글 Custom Search로 카페 리뷰성 웹문서 수집 (PRINCIPLES.md 2조: 공식 API)
// 반환 텍스트는 오케스트레이터에서 노이즈 필터(7조)를 거친 뒤 합성에 사용.
export type WebSnippet = { text: string; time?: number };

const KEY = process.env.GOOGLE_API_KEY;
const CSE = process.env.GOOGLE_CSE_ID;

export async function fetchWebReviews(name: string, area: string): Promise<{ snippets: WebSnippet[]; error?: string; debug?: unknown }> {
  if (!KEY || !CSE) return { snippets: [], error: "GOOGLE_API_KEY 또는 GOOGLE_CSE_ID 미설정" };
  try {
    // 리뷰성 글을 노린 쿼리 (헌법4: 최신 우선 — 구글이 신선도 반영)
    const queries = [
      `${name} ${area} 후기`,
      `${name} ${area} 리뷰`,
      `${name} 카페 맛`,
    ];
    const seen = new Set<string>();
    const snippets: WebSnippet[] = [];
    const debugRaw: unknown[] = [];

    for (const q of queries) {
      const url = `https://www.googleapis.com/customsearch/v1?key=${KEY}&cx=${CSE}&q=${encodeURIComponent(q)}&num=10&hl=ko`;
      const res = await fetch(url);
      const data = await res.json();
      debugRaw.push({ q, status: res.status, items: data.items?.length ?? 0, error: data.error?.message ?? null });
      for (const it of data.items ?? []) {
        // 제목 + 스니펫을 합쳐 한 덩어리로 (본문 일부)
        const text = `${it.title ?? ""} ${it.snippet ?? ""}`.replace(/\s+/g, " ").trim();
        if (text.length < 20) continue;
        const key = text.slice(0, 50);
        if (seen.has(key)) continue;
        seen.add(key);
        snippets.push({ text });
      }
    }
    return { snippets, debug: debugRaw };
  } catch (e) {
    return { snippets: [], error: String(e) };
  }
}
