import type { MetadataRoute } from "next";

// 💡 2026-08-21: /poster·/showcase-styles는 내부 제작 도구인데 크롤 대상이었다.
//   지금 12,069개가 "발견됐지만 크롤 대기"라 예산이 귀하다 — 색인될 이유 없는 곳부터 뺀다.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/owner", "/poster", "/showcase-styles"] },
    sitemap: "https://dongnecoffeenote.com/sitemap.xml",
    host: "https://dongnecoffeenote.com",
  };
}
