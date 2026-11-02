import type { MetadataRoute } from "next";

// 🔴 2026-10-06 — 10-03~10-05 "Disallow: /" 전면차단을 되돌린다. 구글·네이버 크롤이 3일 막히면서
//   검색유입이 말라붙었고, 유입 분석의 "사람 증거"(검색엔진 유입·탐색·재방문·모바일) 중 하나가 빠져
//   진짜 사람까지 노이즈로 집계되는 2차 피해까지 생겼다(사람비율 70%대→28%, 원본 트래픽도 반토막).
//   비용 절감보다 실유입 보호가 우선 — CEO 지시로 즉시 원복.
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
    // 🔴 2026-11-02 — dongtaste·dongfacet 재개(CEO 승인). 09-16에 크롤예산 분산 우려로 뺐던 것을
    //   되돌린다. 판정선 2개 중 AI경유 유입(10-31 기준 300PV)은 1,069PV로 압도 통과 확인(2026-11-02
    //   실측). 네이버 상위10 진입(10-15 기준)은 이 세션에서 확인 도구가 없어 미검증으로 남김 — 다만
    //   페이지 자체는 9-16 이후 7주째 멀쩡히 서비스 중이고(ISR 30일 캐시, 신규 쿼리 없음), 이번 달
    //   전송 15.4GB(무료한도 500GB의 3%)로 여유가 크다. 되돌림 조건은 그대로 유효: 2주 내 네이버
    //   경유 동 계열 유입이 20% 이상 줄면 이 줄만 다시 빼면 된다.
    sitemap: [
      "https://dongnecoffeenote.com/sitemap.xml",
      ...["cafes", "areas", "taste", "facet", "dong", "dongtaste", "dongfacet", "misc"]
        .map((k) => `https://dongnecoffeenote.com/sitemaps/${k}.xml`),
    ],
    host: "https://dongnecoffeenote.com",
  };
}
