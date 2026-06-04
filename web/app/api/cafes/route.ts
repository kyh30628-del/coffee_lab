import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const area = req.nextUrl.searchParams.get("area");
    const rows = area
      ? await sql`SELECT * FROM cafes WHERE published=true AND area=${area} ORDER BY (note IS NOT NULL) DESC, rating DESC NULLS LAST`
      : await sql`SELECT * FROM cafes WHERE published=true ORDER BY (note IS NOT NULL) DESC, rating DESC NULLS LAST`;
    return NextResponse.json({ cafes: rows });
  } catch (e) {
    console.error("cafes GET error:", e);
    return NextResponse.json({ cafes: [], error: String(e) }, { status: 500 });
  }
}
