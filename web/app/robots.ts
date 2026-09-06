import type { MetadataRoute } from "next";

// 💡 2026-08-21: /poster·/showcase-styles는 내부 제작 도구인데 크롤 대상이었다.
//   지금 12,069개가 "발견됐지만 크롤 대기"라 예산이 귀하다 — 색인될 이유 없는 곳부터 뺀다.
// 🤖 2026-09-06(CEO 지시 "AI 유입 폭발적으로"): AI 크롤러는 자기 이름이 명시된 규칙을 먼저 찾는다
//   (2026 실무 가이드 공통 권고). ChatGPT 검색(OAI-SearchBot)·학습(GPTBot)·응답근거(ChatGPT-User),
//   Claude(ClaudeBot·Claude-Web), Perplexity, Gemini 학습(Google-Extended)을 **명시 허용** —
//   내부 도구·관리자만 계속 차단. AI 인용의 재료는 이미 있음(JSON-LD 3블록·llms.txt·검증후기 인용).
const DISALLOW = ["/admin", "/api/", "/owner", "/poster", "/showcase-styles"];
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Google-Extended", "Bytespider"];
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
      { userAgent: "*", allow: "/", disallow: DISALLOW },
    ],
    sitemap: "https://dongnecoffeenote.com/sitemap.xml",
    host: "https://dongnecoffeenote.com",
  };
}
