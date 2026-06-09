// 유튜브 수집 (PRINCIPLES §1·§2·§3·§4): YouTube Data API v3(공식·합법)로 카페 영상의
// 제목·설명·게시일·채널 + 상위 댓글을 수집한다. 영상 1개 = 스니펫 1개(출처 링크=영상 URL).
// 원문(영상 속 말/자막)은 합법적으로 못 가져오므로 제목·설명·댓글까지만 보존.
// 수집된 스니펫은 다른 소스와 동일하게 '리뷰 품질 검증 엔진'을 통과해야 채택된다.
import type { WebSnippet } from "./webSearchCollector";

const KEY = process.env.YOUTUBE_API_KEY;
export const hasYouTubeKey = () => !!KEY;
const API = "https://www.googleapis.com/youtube/v3";

// 짝 없는 유니코드 서로게이트 제거 — slice가 이모지를 반으로 자르면 JSON 저장이 깨지므로(백필 크래시 방지)
const stripBadUnicode = (s: string) => s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
const fmtDate = (iso?: string) => (iso && iso.length >= 10 ? iso.slice(0, 10).replace(/-/g, ".") : "");
const toTime = (iso?: string) => { if (!iso) return undefined; const t = Date.parse(iso); return isNaN(t) ? undefined : Math.floor(t / 1000); };

// 카페 영상 검색 → 상세 → 상위 댓글. 쿼터 절약: 검색 1회(100유닛)+영상상세 1유닛+댓글 상위 4개 영상만.
export async function fetchYouTubeReviews(name: string, area: string): Promise<{ snippets: WebSnippet[]; apiError?: boolean }> {
  if (!KEY) return { snippets: [] };
  try {
    const q = area ? `${name} ${area} 카페` : `${name} 카페`;
    const sres = await fetch(`${API}/search?key=${KEY}&part=snippet&type=video&maxResults=8&order=relevance&relevanceLanguage=ko&q=${encodeURIComponent(q)}`);
    if (!sres.ok) return { snippets: [], apiError: sres.status === 403 || sres.status === 429 || !sres.ok };
    const sdata = await sres.json();
    const ids: string[] = (sdata.items ?? []).map((it: any) => it?.id?.videoId).filter(Boolean);
    if (ids.length === 0) return { snippets: [] };

    const vres = await fetch(`${API}/videos?key=${KEY}&part=snippet&id=${ids.join(",")}`);
    if (!vres.ok) return { snippets: [], apiError: true };
    const vdata = await vres.json();
    const vids: any[] = vdata.items ?? [];

    const snippets: WebSnippet[] = [];
    for (let i = 0; i < vids.length; i++) {
      const v = vids[i];
      const sn = v.snippet ?? {};
      const title = (sn.title ?? "").trim();
      const desc = (sn.description ?? "").replace(/\s+/g, " ").trim().slice(0, 350);
      // 상위 4개 영상만 댓글 수집(쿼터 절약). 댓글=실제 방문 반응 신호.
      let comments = "";
      if (i < 4) {
        try {
          const cres = await fetch(`${API}/commentThreads?key=${KEY}&part=snippet&videoId=${v.id}&maxResults=3&order=relevance&textFormat=plainText`);
          if (cres.ok) {
            const cd = await cres.json();
            // 개인정보 보호(YouTube 정책): 댓글 '텍스트'만 — 작성자 아이디·채널·프로필은 수집/저장 안 함.
            // 텍스트 안의 @아이디 멘션도 제거해 식별정보를 남기지 않는다.
            comments = (cd.items ?? [])
              .map((c: any) => c?.snippet?.topLevelComment?.snippet?.textDisplay ?? "")
              .filter(Boolean)
              .map((t: string) => stripBadUnicode(t.replace(/@[\w.\-가-힣]+/g, "").replace(/\s+/g, " ").trim().slice(0, 110)))
              .filter(Boolean).join(" · ");
          }
        } catch { /* 댓글 비활성/오류 무시 */ }
      }
      const text = `${title} ${desc}${comments ? ` 댓글: ${comments}` : ""}`.replace(/\s+/g, " ").trim();
      if (text.length < 15) continue;
      snippets.push({
        text: stripBadUnicode(text), title: stripBadUnicode(title),
        desc: stripBadUnicode(`${desc}${comments ? ` · 댓글: ${comments}` : ""}`.slice(0, 320)),
        time: toTime(sn.publishedAt),
        link: `https://www.youtube.com/watch?v=${v.id}`,
        source: sn.channelTitle || "YouTube",
        date: fmtDate(sn.publishedAt),
      });
    }
    return { snippets };
  } catch {
    return { snippets: [], apiError: true };
  }
}
