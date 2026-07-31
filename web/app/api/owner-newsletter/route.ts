import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ownerScope } from "@/lib/ownerAuth";

export const runtime = "nodejs";

// 📰 사장님 본인의 주간 뉴스레터 수신 on/off — 신청 때 껐어도 본인이 직접 다시 켤 수 있게(정당한 동의 경로).
//   인증: 활성 구독 PIN(x-owner-pin) → 그 cafe_id의 구독행만 변경. 관리자(x-admin-password)면 body.cafeId 허용.
//   GET=현재 상태, POST { optIn:boolean }=변경.
async function targetCafeId(req: NextRequest, bodyCafeId?: unknown): Promise<number | null> {
  const scope = await ownerScope(req);
  if (scope === "admin") return Number(bodyCafeId) || null;
  return typeof scope === "number" ? scope : null;
}

export async function GET(req: NextRequest) {
  const cafeId = await targetCafeId(req);
  if (!cafeId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const r = (await sql`SELECT COALESCE(newsletter_opt_in, true) AS opt_in, (email IS NOT NULL) AS has_email FROM subscriptions WHERE cafe_id = ${cafeId} AND status = 'active'`)[0] as any;
    if (!r) return NextResponse.json({ ok: false, error: "구독 없음" }, { status: 404 });
    return NextResponse.json({ ok: true, optIn: !!r.opt_in, hasEmail: !!r.has_email });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cafeId = await targetCafeId(req, body.cafeId);
  if (!cafeId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const optIn = body.optIn === true; // 명시적 boolean만 허용
  try {
    const rows = (await sql`UPDATE subscriptions SET newsletter_opt_in = ${optIn}, updated_at = now() WHERE cafe_id = ${cafeId} AND status = 'active' RETURNING cafe_id`) as any[];
    if (!rows.length) return NextResponse.json({ ok: false, error: "구독 없음" }, { status: 404 });
    return NextResponse.json({ ok: true, optIn });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
  }
}
