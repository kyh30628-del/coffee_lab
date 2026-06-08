import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 사장님 구독(홍보팩) 신청 — 리드 캡처. 관리자가 확인 후 결제 안내·우선노출 부여.
async function ensure() {
  await sql`CREATE TABLE IF NOT EXISTS sub_requests (
    id SERIAL PRIMARY KEY, cafe_name TEXT, contact TEXT, plan TEXT,
    status TEXT DEFAULT 'new', created_at TIMESTAMPTZ DEFAULT now()
  )`;
}
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function POST(req: NextRequest) {
  try {
    await ensureSchema(); await ensure();
    const b = await req.json().catch(() => ({}));
    const cafeName = String(b.cafeName ?? "").trim().slice(0, 80);
    const contact = String(b.contact ?? "").trim().slice(0, 120);
    const plan = String(b.plan ?? "홍보팩").slice(0, 40);
    if (!cafeName || !contact) return NextResponse.json({ ok: false, error: "가게명·연락처 필요" }, { status: 400 });
    await sql`INSERT INTO sub_requests (cafe_name, contact, plan) VALUES (${cafeName}, ${contact}, ${plan})`;
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
    await ensure();
    const rows = await sql`SELECT id, cafe_name, contact, plan, status, created_at FROM sub_requests ORDER BY created_at DESC LIMIT 100`;
    return NextResponse.json({ ok: true, requests: rows });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}
