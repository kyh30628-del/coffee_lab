import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

// 취향 저장
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const b = await req.json();
    // 입력 검증 (0~1 범위 강제, 잘못된 값 차단)
    const clamp = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
    };
    const acidity = clamp(b.acidity);
    const body = clamp(b.body);
    const sweetness = clamp(b.sweetness);
    const flavors = Array.isArray(b.flavors) ? b.flavors.slice(0, 10).join(",") : "";
    const topOrigin = typeof b.top_origin === "string" ? b.top_origin.slice(0, 80) : "";

    await sql`
      INSERT INTO taste_logs (acidity, body, sweetness, flavors, top_origin)
      VALUES (${acidity}, ${body}, ${sweetness}, ${flavors}, ${topOrigin})
    `;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("taste POST error:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// 집계 통계 (나중에 인기 원두 화면에서 사용)
export async function GET() {
  try {
    await ensureSchema();
    const total = await sql`SELECT COUNT(*)::int AS n FROM taste_logs`;
    const topOrigins = await sql`
      SELECT top_origin, COUNT(*)::int AS n
      FROM taste_logs
      WHERE top_origin <> ''
      GROUP BY top_origin ORDER BY n DESC LIMIT 10
    `;
    const avg = await sql`
      SELECT ROUND(AVG(acidity)::numeric,3) AS acidity,
             ROUND(AVG(body)::numeric,3) AS body,
             ROUND(AVG(sweetness)::numeric,3) AS sweetness
      FROM taste_logs
    `;
    return NextResponse.json({
      total: total[0]?.n ?? 0,
      top_origins: topOrigins,
      avg: avg[0] ?? null,
    });
  } catch (e) {
    console.error("taste GET error:", e);
    return NextResponse.json({ total: 0, top_origins: [], avg: null }, { status: 500 });
  }
}
