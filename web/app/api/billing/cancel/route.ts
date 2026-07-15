import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ownerScope } from "@/lib/ownerAuth";
import { ensureBilling } from "@/lib/billing";
export const runtime = "nodejs";

// 💳 정기결제 셀프 해지(POST, 사장님 PIN). autopay만 끈다(차기 결제 중지).
//   잔여기간(expires_at)까지는 그대로 이용 → 만료 시 기존 ensure()가 혜택 OFF. 환불은 고객센터(약관 정책).
export async function POST(req: NextRequest) {
  try {
    await ensureBilling();
    const scope = await ownerScope(req);
    if (scope === null) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const bodyCafe = Number((await req.json().catch(() => ({}))).cafeId);
    const cafeId = scope === "admin" ? bodyCafe : scope;
    if (!cafeId) return NextResponse.json({ ok: false, error: "cafeId 필요" }, { status: 400 });
    await sql`UPDATE subscriptions SET autopay=false, billing_status='canceled', next_billing_at=NULL, updated_at=now() WHERE cafe_id=${cafeId}`;
    const r = (await sql`SELECT expires_at FROM subscriptions WHERE cafe_id=${cafeId}`)[0] as any;
    return NextResponse.json({ ok: true, autopay: false, activeUntil: r?.expires_at ?? null });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}
