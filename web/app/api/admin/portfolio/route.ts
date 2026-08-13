import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 🏛️ 포트폴리오 프록시 — 커피 관제탑이 형제 서비스(부동산 나침반)의 이슈·결재를 '읽기 전용'으로 본다.
// 🔴 설계 원칙(비용·안전):
//   · 읽기 전용(조회만) — 커피의 이슈↔결재 자동화는 동결 상태이므로 쓰기·자동조치는 넣지 않는다.
//   · 서버에서만 OPS_TOKEN을 붙인다(클라이언트로 토큰이 새지 않게).
//   · 60초 캐시 + 6초 타임아웃 — 상대 서비스 부하·비용이 늘지 않게(상대도 자체 60초 캐시 보유).
//   · 실패해도 커피 관제탑을 깨뜨리지 않는다(ok:false만 반환).
const SERVICES = [
  { key: "budongsan", name: "부동산 나침반", emoji: "🧭",
    url: "https://budongsan-note-omega.vercel.app", admin: "https://budongsan-note-omega.vercel.app/admin" },
];

let cache: { at: number; body: unknown } | null = null;
const TTL = 60_000;

export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json({ ...(cache.body as object), cached: true });

  const token = process.env.OPS_TOKEN ?? "";
  const services = await Promise.all(SERVICES.map(async (s) => {
    try {
      const res = await fetch(`${s.url}/api/ops/status`, {
        headers: { "x-ops-token": token }, signal: AbortSignal.timeout(6_000), cache: "no-store",
      });
      if (!res.ok) return { ...s, ok: false, error: `HTTP ${res.status}` };
      const d = await res.json();
      return { ...s, ok: true, ...d };
    } catch (e) {
      return { ...s, ok: false, error: String((e as Error)?.message ?? e).slice(0, 80) };
    }
  }));

  const body = { ok: true, at: new Date().toISOString(), services };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
