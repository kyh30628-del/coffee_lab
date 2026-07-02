import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

const FONT_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/gowun-batang@5.2.5/files/gowun-batang-korean-700-normal.woff";
let fontCache: ArrayBuffer | null = null;
async function getFont(): Promise<ArrayBuffer | null> {
  if (fontCache) return fontCache;
  try {
    const r = await fetch(FONT_URL);
    if (r.ok) fontCache = await r.arrayBuffer();
  } catch {}
  return fontCache;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cafeId: string }> }
) {
  try {
    const { cafeId } = await params;

    const rows = await sql`
      SELECT id, name, area, synth_count, synth_grade
      FROM cafes
      WHERE id = ${cafeId} AND published = true
      LIMIT 1
    `;

    if (!rows.length) {
      return NextResponse.json({ error: "카페를 찾을 수 없습니다" }, { status: 404 });
    }

    const cafe = rows[0] as {
      id: string;
      name: string;
      area: string | null;
      synth_count: number | null;
      synth_grade: string | null;
    };
    const area = cafe.area ?? "전체";
    const synthCount = cafe.synth_count ?? 0;

    // Rank by synth_count within same area (higher = more prominent)
    const [rankRow, totalRow] = await Promise.all([
      sql`
        SELECT COUNT(*)::int + 1 AS rank
        FROM cafes
        WHERE area = ${area}
          AND published = true
          AND (synth_count > ${synthCount} OR (synth_count = ${synthCount} AND id < ${cafeId}))
      `,
      sql`
        SELECT COUNT(*)::int AS total
        FROM cafes
        WHERE area = ${area} AND published = true
      `,
    ]);

    const rank = Number(rankRow[0]?.rank ?? 1);
    const total = Number(totalRow[0]?.total ?? 1);
    const font = await getFont();

    const gradeLabel =
      cafe.synth_grade === "검증" ? "검증된 맛집" : "추천 카페";
    const W = 1080;
    const H = 1080;

    const image = new ImageResponse(
      (
        <div
          style={{
            width: W,
            height: H,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(160deg, #3D1A00 0%, #0F0600 100%)",
            padding: "72px 80px 60px",
            fontFamily: "Gowun",
            color: "#F5E6C8",
            position: "relative",
          }}
        >
          {/* Top gold bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: W,
              height: 5,
              background: "#D4A853",
              display: "flex",
            }}
          />
          {/* Bottom gold bar */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: W,
              height: 5,
              background: "#D4A853",
              display: "flex",
            }}
          />

          {/* Branding */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0,
            }}
          >
            <div
              style={{
                fontSize: 30,
                color: "#D4A853CC",
                letterSpacing: 8,
              }}
            >
              동네커피노트
            </div>
            <div
              style={{
                width: 280,
                height: 1,
                background: "#D4A85340",
                marginTop: 16,
                display: "flex",
              }}
            />
          </div>

          {/* Rank circle + label */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0,
            }}
          >
            <div
              style={{
                fontSize: 34,
                color: "#F5E6C8CC",
                letterSpacing: 10,
                marginBottom: 16,
              }}
            >
              지역 순위
            </div>
            {/* Outer ring */}
            <div
              style={{
                width: 460,
                height: 460,
                borderRadius: "50%",
                border: "2.5px solid #D4A85399",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Rank number */}
              <div
                style={{
                  display: "flex",
                  fontSize: 220,
                  fontWeight: 700,
                  color: "#D4A853",
                  lineHeight: 1,
                  letterSpacing: -6,
                }}
              >
                #{rank}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 36,
                color: "#F5E6C880",
                marginTop: 24,
              }}
            >
              / {total}개 카페 중
            </div>
          </div>

          {/* Cafe info */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0,
            }}
          >
            <div
              style={{
                width: 360,
                height: 1,
                background: "#D4A85340",
                marginBottom: 32,
                display: "flex",
              }}
            />
            <div
              style={{
                display: "flex",
                fontSize: 36,
                color: "#D4A853CC",
                letterSpacing: 4,
                marginBottom: 16,
              }}
            >
              {area} 지역
            </div>
            <div
              style={{
                fontSize: 70,
                fontWeight: 700,
                textAlign: "center",
                lineHeight: 1.2,
                color: "#F5E6C8",
                marginBottom: 20,
              }}
            >
              {cafe.name}
            </div>
            {/* Grade badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 28px",
                borderRadius: 999,
                border: "1.5px solid #D4A85366",
                background: "#D4A85318",
                fontSize: 26,
                color: "#D4A853",
              }}
            >
              {gradeLabel}
            </div>
          </div>

          {/* Footer */}
          <div style={{ fontSize: 22, color: "#D4A85366", letterSpacing: 2 }}>
            dongnecoffeenote.com
          </div>
        </div>
      ),
      {
        width: W,
        height: H,
        fonts: font
          ? [{ name: "Gowun", data: font, weight: 700 as const, style: "normal" as const }]
          : [],
      }
    );

    // Attach cache headers
    const headers = new Headers(image.headers);
    headers.set("Cache-Control", "public, s-maxage=7200, stale-while-revalidate=86400");
    headers.set("Content-Disposition", `inline; filename="badge-${cafeId}.png"`);

    return new NextResponse(image.body, { status: image.status, headers });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
