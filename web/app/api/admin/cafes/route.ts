import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

function auth(req: NextRequest): boolean {
  const pw = req.headers.get("x-admin-password");
  const real = process.env.ADMIN_PASSWORD;
  return !!real && pw === real;
}

// 전체 카페 조회 (비공개 포함) — 검수용
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    await ensureSchema();
    const rows = await sql`SELECT * FROM cafes ORDER BY published ASC, source DESC, created_at DESC`;
    return NextResponse.json({ ok: true, cafes: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// 공개/숨김 토글 또는 삭제
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    await ensureSchema();
    const { id, action, published } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: "no id" }, { status: 400 });

    if (action === "delete") {
      await sql`DELETE FROM cafes WHERE id=${id}`;
    } else if (action === "publish") {
      await sql`UPDATE cafes SET published=${!!published}, updated_at=now() WHERE id=${id}`;
    } else {
      return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
