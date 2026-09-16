import type { MetadataRoute } from "next";

// 💡 2026-08-21: /poster·/showcase-styles는 내부 제작 도구인데 크롤 대상이었다.
//   지금 12,069개가 "발견됐지만 크롤 대기"라 예산이 귀하다 — 색인될 이유 없는 곳부터 뺀다.
// 🤖 2026-09-06(CEO 지시 "AI 유입 폭발적으로"): AI 크롤러는 자기 이름이 명시된 규칙을 먼저 찾는다
//   (2026 실무 가이드 공통 권고). ChatGPT 검색(OAI-SearchBot)·학습(GPTBot)·응답근거(ChatGPT-User),
//   Claude(ClaudeBot·Claude-Web), Perplexity, Gemini 학습(Google-Extended)을 **명시 허용** —
//   내부 도구·관리자만 계속 차단. AI 인용의 재료는 이미 있음(JSON-LD 3블록·llms.txt·검증후기 인용).
const DISALLOW = ["/admin", "/api/", "/owner", "/poster", "/showcase-styles"];
// 🔴 2026-09-15 공식 문서 대조로 명단을 고쳤다(CEO "사람의 검색으로 유입되는 것만 중요하다").
//   전에는 **학습용 봇만 정확히** 넣고 정작 **답변·검색용 봇이 빠져 있었다** — 유입을 만드는 건 후자다.
//   Anthropic 공식 3종: ClaudeBot(학습) · Claude-SearchBot(검색) · Claude-User(사용자 질문) —
//     우리는 ClaudeBot만 맞고 뒤 둘이 없었다. Claude-Web·anthropic-ai는 공식 목록에 없는 옛 이름이지만
//     지운다고 이득이 없어 남긴다(구버전 봇이 `*`로 떨어질 뿐, `*`도 허용이라 결과 동일).
//   OpenAI 공식 4종: GPTBot(학습) · OAI-SearchBot(ChatGPT 검색) · ChatGPT-User(사용자 행동) · OAI-AdsBot.
//   Google: Google-Extended(Gemini 학습·그라운딩) 외에 GoogleOther·Google-CloudVertexBot이 빠져 있었다.
//   ⚠️ 지금도 맨 아래 `User-agent: * / Allow: /`가 **미등재 봇까지 전부 허용**한다. 명시는 확실성·신호용이다
//      (봇은 자기 이름이 있으면 그 규칙만 보고 `*`를 무시한다).
const AI_BOTS = [
  // ── 답변·검색용(= 사람 유입을 만든다. 우선순위 최상) ──
  "OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User",
  "DuckAssistBot", "YouBot", "MistralAI-User",
  // ── 학습·수집용(유입은 안 만들지만 인용 재료가 된다) ──
  "GPTBot", "ClaudeBot", "Google-Extended", "GoogleOther", "Google-CloudVertexBot",
  "Applebot", "Applebot-Extended", "meta-externalagent", "FacebookBot", "Amazonbot",
  "cohere-ai", "Diffbot", "Bytespider", "OAI-AdsBot",
  // ── 옛 이름(공식 목록엔 없지만 남겨 둔다) ──
  "Claude-Web", "anthropic-ai",
];
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
      { userAgent: "*", allow: "/", disallow: DISALLOW },
    ],
    // 전체 + 유형별을 함께 싣는다 — 유형별은 Search Console에서 **색인 수를 따로 보기 위한 것**이다.
    // 🔴 2026-09-16 — dongtaste·dongfacet 제외(CEO 승인). 라우트(/sitemaps/dongtaste.xml)는 살아 있고
    //   여기서 '크롤해달라'는 신호만 뺀다. 근거는 app/sitemap.ts 주석 참조
    //   (제출 34,455 → 색인 3,100(9%) · "발견됐지만 크롤 안 함" 18,318개 · 노출 상위 10개 중 9개가 카페 상세).
    sitemap: [
      "https://dongnecoffeenote.com/sitemap.xml",
      ...["cafes", "areas", "taste", "facet", "dong", "misc"]
        .map((k) => `https://dongnecoffeenote.com/sitemaps/${k}.xml`),
    ],
    host: "https://dongnecoffeenote.com",
  };
}
