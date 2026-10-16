import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 📍 내 위치 근처 공개 카페 — SEO 페이지(지역·상세)에서 쓰는 **초경량** 조회(2026-10-16).
//
// 왜 만들었나(실측):
//   위치 동의 요청이 홈·지도에서만 떴는데, 최근 14일 방문자 4,462명 중 홈·지도에 도달한 사람은 10.5%뿐이고
//   89.4%는 네이버에서 SEO 페이지로 들어와 그것만 보고 나간다. 그래서 동의자 155명 중 145명(94%)이 수도권이었다
//   — 공개 카페는 수도권 49%/지방 51%, 사람 조회는 66%/34%인데도 그렇다.
//   즉 "지방 사람이 동의를 안 한 것"이 아니라 **물어본 적이 없던 것**이다. SEO 페이지에서 바로 물어볼 수 있게 한다.
//
// 💰 비용: 클릭할 때만 1회. 부분 인덱스 idx_cafes_geo(lat,lng) WHERE published를 타는 좌표 박스 조회라
//   전수 스캔이 없다. 응답은 6곳·수 KB. 홈의 /api/cafes(15MB 전량)를 SEO 페이지에서 쓰지 않으려고 따로 둔다.
//   ⚠️ 좌표가 사람마다 달라 CDN 캐시가 의미 없다 → no-store. 대신 쿼리가 작다.
const R_DEG = 0.135; // 위도 약 15km(경도는 위도대 보정 없이 넉넉히)

export async function GET(req: NextRequest) {
  try {
    const lat = Number(req.nextUrl.searchParams.get("lat"));
    const lng = Number(req.nextUrl.searchParams.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ ok: false, error: "lat/lng 필요" }, { status: 400 });
    }
    const rows = (await sql`
      SELECT id, name, area, dong, synth_grade, synth_count, synth_identity, lat, lng,
             (6371 * acos(LEAST(1, cos(radians(${lat})) * cos(radians(lat)) * cos(radians(lng) - radians(${lng}))
                + sin(radians(${lat})) * sin(radians(lat))))) AS km
      FROM cafes
      WHERE published AND lat IS NOT NULL
        AND lat BETWEEN ${lat - R_DEG} AND ${lat + R_DEG}
        AND lng BETWEEN ${lng - R_DEG} AND ${lng + R_DEG}
      ORDER BY km ASC
      LIMIT 6`) as { id: number; name: string; area: string; dong: string | null; synth_grade: string | null; synth_count: number | null; synth_identity: string | null; km: number }[];

    const region = rows[0] ? `${rows[0].area}${rows[0].dong ? ` ${rows[0].dong}` : ""}` : null;
    return NextResponse.json(
      { ok: true, region, area: rows[0]?.area ?? null, cafes: rows.map((r) => ({ ...r, km: Math.round(r.km * 10) / 10 })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120), cafes: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
