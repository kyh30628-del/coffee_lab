import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sql } from "@/lib/db";
import { ownerScope } from "@/lib/ownerAuth";
import { ensureBilling, tossClientKey } from "@/lib/billing";
export const runtime = "nodejs";

// 💳 카드 등록 준비 — 사장님(PIN) 인증 후 카페별 customerKey를 서버가 생성·저장하고 clientKey와 함께 내려준다.
//   이 customerKey가 authorize 콜백의 신뢰 경계(위조 방지): 콜백은 저장된 값과 대조해 카페를 특정한다.
export async function POST(req: NextRequest) {
  try {
    await ensureBilling();
    const scope = await ownerScope(req);
    if (scope === null) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const bodyCafe = Number((await req.json().catch(() => ({}))).cafeId);
    const cafeId = scope === "admin" ? bodyCafe : scope; // 관리자면 body의 cafeId, 사장님이면 본인 카페 고정
    if (!cafeId) return NextResponse.json({ ok: false, error: "cafeId 필요" }, { status: 400 });
    const clientKey = tossClientKey();
    if (!clientKey) return NextResponse.json({ ok: false, error: "결제 준비 중입니다(키 미설정)" }, { status: 503 });
    // 기존 customerKey 있으면 재사용(빌링키와 짝), 없으면 유추 불가 UUID 생성.
    const cur = (await sql`SELECT billing_customer_key FROM subscriptions WHERE cafe_id=${cafeId}`)[0] as any;
    let customerKey = cur?.billing_customer_key as string | undefined;
    if (!customerKey) {
      customerKey = `dcn_${crypto.randomUUID()}`;
      await sql`UPDATE subscriptions SET billing_customer_key=${customerKey}, updated_at=now() WHERE cafe_id=${cafeId}`;
    }
    return NextResponse.json({ ok: true, customerKey, clientKey });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}
