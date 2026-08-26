import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";

// 🏅 검증 배지 SVG — 사장님이 블로그·홈페이지에 붙이는 위젯. **백링크 엔진**이다(2026-08-26 CEO 승인).
//   사장님이 이 배지를 달면 그 페이지에서 우리 카페 상세로 링크가 걸린다 — 링크 구매(정책 위반)가
//   아니라 자발적 인증 표시라서 안전하고, 고객이 늘수록 자동으로 쌓인다.
//
// 💰 CDN 1일 캐시 — 배지는 등급이 바뀔 때만 달라지므로 매 요청 DB 조회는 낭비다.
//   비공개/미검증 카페는 배지를 주지 않는다(배지가 곧 인증이므로).
// ⚠️ 2026-08-26: 기존에 같은 경로의 PNG 배지(ImageResponse+외부 폰트 fetch)가 있었으나
//   어디서도 사용되지 않았고 요청마다 렌더링돼 비쌌다 — SVG+CDN 캐시로 대체(사용처 검색 0건 확인).
const COLORS: Record<string, { bg: string; label: string }> = {
  검증: { bg: "#5f7355", label: "검증 카페" },
  참고: { bg: "#9c6b3f", label: "참고 등급" },
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cafeId: string }> }) {
  const { cafeId: id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return new NextResponse("bad id", { status: 400 });
  try {
    const r = (await sql`SELECT name, synth_grade, synth_count FROM cafes WHERE id=${n} AND published LIMIT 1`)[0] as any;
    const style = r && COLORS[r.synth_grade];
    if (!style) return new NextResponse("not eligible", { status: 404 }); // 배지=인증 — 비공개·미검증엔 안 준다
    const name = String(r.name).slice(0, 14).replace(/[<>&"]/g, "");
    const count = Number(r.synth_count ?? 0);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="230" height="54" role="img" aria-label="동네 커피 노트 ${style.label}">
  <rect width="230" height="54" rx="10" fill="#f4ece0" stroke="#d9c9ab"/>
  <rect x="8" y="10" width="70" height="34" rx="8" fill="${style.bg}"/>
  <text x="43" y="27" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="#fff">☕ ${style.label}</text>
  <text x="43" y="39" text-anchor="middle" font-family="sans-serif" font-size="8" fill="#f4ece0">후기 ${count}건 검증</text>
  <text x="86" y="24" font-family="sans-serif" font-size="12" font-weight="700" fill="#2b2018">${name}</text>
  <text x="86" y="40" font-family="sans-serif" font-size="9" fill="#7a5122">동네 커피 노트 · 진짜 후기 검증</text>
</svg>`;
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse("error", { status: 500 });
  }
}
