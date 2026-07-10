// 유입경로 출처 분류 — app/api/visit/route.ts(수집 시점) 단일출처.
// 자사 Vercel 프리뷰 배포와 알려진 리퍼러 스팸을 각각 'internal'/'spam' 버킷으로 분리해
// 유입경로 집계·어드민 대시보드에서 실제 외부 유입 통계를 오염시키지 않게 한다.

// 흔한 리퍼러 스팸(구글 애널리틱스 유령 스팸으로 악명 높은) 도메인·키워드.
const SPAM_REFERRER_PATTERN = /semalt|buttons-for-website|free-social-buttons|darodar|ilovevitaly|econom\.co|4webmasters|simple-share-buttons|hulfingtonpost|myftpupload|traffic2cash|best-seo-offer/i;

// referrer/UTM → 출처 버킷. utm_source가 있으면 우선(우리가 붙인 공유링크 식별).
export function sourceBucket(ref: string, utmSource: string): string {
  const s = (utmSource || "").toLowerCase().trim();
  if (s) return s.slice(0, 40);
  const r = (ref || "").toLowerCase();
  if (!r) return "direct";
  if (r.includes("naver.")) return "naver";
  if (r.includes("google.")) return "google";
  if (r.includes("instagram.")) return "instagram";
  if (r.includes("threads.")) return "threads";
  if (r.includes("daum.") || r.includes("kakao")) return "kakao";
  if (r.includes("youtube.") || r.includes("youtu.be")) return "youtube";
  if (r.includes("facebook.") || r.includes("fb.")) return "facebook";
  if (r.includes("bing.")) return "bing";
  if (r.includes("dongnecoffeenote.com")) return "internal";
  if (r.includes(".vercel.app")) return "internal"; // 자사 프리뷰 배포(프로젝트명-git-*.vercel.app 등)
  if (SPAM_REFERRER_PATTERN.test(r)) return "spam";
  try { return new URL(ref).hostname.replace(/^www\./, "").slice(0, 40); } catch { return "other"; }
}
