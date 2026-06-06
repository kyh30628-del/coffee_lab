// 네이버 검색 API로 카페 리뷰성 문서 수집 (PRINCIPLES.md 2조: 공식 API, 합법)
// (A)방식: 원문 복제 금지. 인용 한 줄(요약) + 출처 링크 + 날짜만 보존.
export type WebSnippet = { text: string; time?: number; link?: string; source?: string; date?: string };

const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;

function stripTags(s: string): string {
  return (s || "").replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
}
function parseDate(d?: string): number | undefined {
  if (!d || d.length !== 8) return undefined;
  const y = +d.slice(0, 4), m = +d.slice(4, 6), day = +d.slice(6, 8);
  const t = new Date(y, m - 1, day).getTime();
  return isNaN(t) ? undefined : Math.floor(t / 1000);
}
function fmtDate(d?: string): string {
  if (!d || d.length !== 8) return "";
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

async function naverSearch(kind: "blog" | "cafearticle", query: string): Promise<WebSnippet[]> {
  if (!ID || !SECRET) return [];
  const url = `https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(query)}&display=20&sort=date`;
  const res = await fetch(url, { headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SECRET } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? []).map((it: { title?: string; description?: string; postdate?: string; link?: string; bloggername?: string }) => {
    const title = stripTags(it.title ?? "");
    const desc = stripTags(it.description ?? "");
    return {
      text: `${title} ${desc}`.trim(),
      time: parseDate(it.postdate),
      link: it.link,
      source: it.bloggername || (kind === "cafearticle" ? "네이버 카페" : "네이버 블로그"),
      date: fmtDate(it.postdate),
    };
  }).filter((s: WebSnippet) => s.text.length >= 20);
}

export async function fetchWebReviews(name: string, area: string): Promise<{ snippets: WebSnippet[]; error?: string; debug?: unknown }> {
  if (!ID || !SECRET) return { snippets: [], error: "NAVER_CLIENT_ID/SECRET 미설정" };
  try {
    const queries = [`${name} ${area}`, `${name} 카페 후기`, `${name} 리뷰`];
    const seen = new Set<string>();
    const snippets: WebSnippet[] = [];
    const debug: unknown[] = [];
    for (const q of queries) {
      for (const kind of ["blog", "cafearticle"] as const) {
        const items = await naverSearch(kind, q);
        debug.push({ q, kind, got: items.length });
        for (const it of items) {
          const key = it.text.slice(0, 50);
          if (seen.has(key)) continue;
          seen.add(key);
          snippets.push(it);
        }
      }
    }
    return { snippets, debug };
  } catch (e) {
    return { snippets: [], error: String(e) };
  }
}
