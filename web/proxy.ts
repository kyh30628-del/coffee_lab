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

// 🚦 크론 관문(2026-10-10, CEO "크론·에이전트를 단계적으로 정상화, 하루 $0.5 이내").
//   예전엔 크론을 끄고 켜는 수단이 vercel.json 수정 = **배포**뿐이었고, 배포마다 ISR 캐시가 초기화돼 돈이 들었다.
//   → vercel.json엔 전부 등록해 두고, 실제 실행 여부는 DB `cron_gate`(path → enabled)로 정한다. 배포 없이 단계별로 연다.
//   목록에 없거나 enabled=false면 실행하지 않고 200(skipped)으로 끝낸다. DB 조회가 실패하면 **열지 않는다**(비용 쪽으로 안전).
//   비용감시·캐시 큐 비우기는 관문 없이 항상 돈다(이 둘이 멈추면 감시·신선도가 무너진다).
const CRON_PREFIXES = ["/api/cron-", "/api/orchestrator"];
const CRON_ALWAYS = new Set(["/api/cron-costwatch", "/api/cron-cache-flush"]);
async function cronGateOpen(pathname: string): Promise<boolean> {
  if (CRON_ALWAYS.has(pathname)) return true;
  try {
    const { sql } = await import("@/lib/db");
    const r = (await sql`SELECT enabled FROM cron_gate WHERE path = ${pathname}`) as { enabled: boolean }[];
    return r[0]?.enabled === true;
  } catch { return false; }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Vercel 크론만 관문을 거친다(공식 문서: 모든 크론 요청에 `x-vercel-cron-schedule` 헤더). 로컬 워커·관리자가 직접 부르는 건 그대로 통과.
  //   헤더를 위조해도 결과는 "건너뜀" 또는 원래 라우트(CRON_SECRET 인증)로 가는 것뿐이다.
  if (CRON_PREFIXES.some((p) => pathname.startsWith(p)) && req.headers.has("x-vercel-cron-schedule")) {
    if (!(await cronGateOpen(pathname))) return NextResponse.json({ ok: true, skipped: "cron_gate" });
    return NextResponse.next();
  }
  if (EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const isSearch = pathname === "/api/search" || pathname.startsWith("/api/search/");
  const { max, windowMs } = isSearch ? SEARCH_LIMIT : DEFAULT_LIMIT;
  const key = `${clientIp(req)}:${isSearch ? "search" : "api"}`;
  const { allowed, remaining, resetMs } = await checkRateLimit(key, max, windowMs);

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
