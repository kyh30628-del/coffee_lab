import type { MetadataRoute } from "next";

// 🔴 2026-10-03 — Vercel 지출관리 비상(ISR Writes가 온디맨드의 64%, 한도 재정지 임박) CEO 명시 지시:
//   "사람이 사이트 열어볼 때 쓰는 비용 말고 다른 건 다 멈춰." 봇이 페이지를 재방문할 때마다
//   ISR 재생성(=과금)이 발생하므로, 10/11 결제주기 리셋 전까지 전체 봇 크롤을 전면 차단한다.
//   실제 사람 방문(직접 링크·이미 색인된 검색결과로 들어오는 사용자)에는 영향 없음 — robots.txt는
//   잘 작동하는 봇만 준수하고, 실사용자 브라우저는애초에 이 파일을 안 읽는다.
//   🔁 10/11 리셋 후 원복할 것 — 직전 버전(AI_BOTS 명시 허용 목록 + 동×취향/동×시설축만 차단)은
//   git log(이 커밋 바로 이전)에 그대로 남아있다.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
    sitemap: [
      "https://dongnecoffeenote.com/sitemap.xml",
      ...["cafes", "areas", "taste", "facet", "dong", "misc"]
        .map((k) => `https://dongnecoffeenote.com/sitemaps/${k}.xml`),
    ],
    host: "https://dongnecoffeenote.com",
  };
}
