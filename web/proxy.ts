import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

// 🛡️ 공개 API 전역 레이트리밋 — 결재#1079(협업#415): middleware(현 Next16 proxy) 부재가 구조적 공백이었다.
//   /api/admin·/api/cron-*·/api/orchestrator는 이미 CRON_SECRET/관리자 인증으로 게이트돼 있어 제외
//   (CEO 관제탑·launchd 잡 자체 호출이 한도에 걸려 오작동하는 걸 막는다).
//   /api/search는 임베딩·LLM 재랭킹이 붙어 단가가 더 비싸 별도로 더 빡빡한 한도를 둔다.
const EXEMPT_PREFIXES = ["/api/admin", "/api/cron-", "/api/orchestrator"];
const DEFAULT_LIMIT = { max: 100, windowMs: 60_000 }; // IP당 분당 100회 — 공개 API 공통 기본선
const SEARCH_LIMIT = { max: 30, windowMs: 60_000 }; // /api/search만 더 빡빡하게(2026-09-12 사고 진원지)

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const isSearch = pathname === "/api/search" || pathname.startsWith("/api/search/");
  const { max, windowMs } = isSearch ? SEARCH_LIMIT : DEFAULT_LIMIT;
  const key = `${clientIp(req)}:${isSearch ? "search" : "api"}`;
  const { allowed, remaining, resetMs } = checkRateLimit(key, max, windowMs);

  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "요청이 많습니다. 잠시 후 다시 시도해 주세요." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(resetMs / 1000)),
          "X-RateLimit-Limit": String(max),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Remaining", String(remaining));
  return res;
}

export const config = { matcher: ["/api/:path*"] };
