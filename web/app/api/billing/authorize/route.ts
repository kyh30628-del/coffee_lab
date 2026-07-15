import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureBilling, issueBillingKey, cardDisplay, chargeOnce } from "@/lib/billing";
export const runtime = "nodejs";

// 💳 토스 카드등록 successUrl 콜백(GET). 쿼리: authKey, customerKey.
//   customerKey를 저장된 billing_customer_key와 대조해 카페 특정(위조 방지) → 빌링키 발급·저장.
//   잔여기간이 남았으면(체험/유료 중) 카드만 걸고 다음결제일=만료일 세팅, 만료됐으면 즉시 첫 과금.
function redirect(base: string, ok: boolean, reason = "") {
  const url = new URL("/owner", base);
  url.searchParams.set("billing", ok ? "ok" : "fail");
  if (reason) url.searchParams.set("reason", reason);
  return NextResponse.redirect(url, { status: 303 });
}

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  try {
    await ensureBilling();
    const authKey = req.nextUrl.searchParams.get("authKey") || "";
    const customerKey = req.nextUrl.searchParams.get("customerKey") || "";
    if (!authKey || !customerKey) return redirect(base, false, "missing_params");
    const sub = (await sql`SELECT cafe_id, expires_at, status FROM subscriptions WHERE billing_customer_key=${customerKey}`)[0] as any;
    if (!sub?.cafe_id) return redirect(base, false, "unknown_customer");
    const cafeId = Number(sub.cafe_id);

    const issued = await issueBillingKey(authKey, customerKey);
    if (!issued.ok || !issued.data?.billingKey) return redirect(base, false, "issue_failed");
    const { last4, company } = cardDisplay(issued.data);
    await sql`UPDATE subscriptions SET billing_key=${issued.data.billingKey}, card_last4=${last4}, card_company=${company},
        card_registered_at=now(), billing_status='registered', autopay=true, updated_at=now()
      WHERE cafe_id=${cafeId}`;

    // 잔여기간 판단: 만료 전(체험/유료 진행 중)이면 첫 과금은 만료일에(크론). 만료·미시작이면 즉시 과금.
    const active = sub.expires_at && new Date(sub.expires_at).getTime() > Date.now();
    if (active) {
      await sql`UPDATE subscriptions SET next_billing_at=expires_at WHERE cafe_id=${cafeId}`;
      return redirect(base, true, "card_registered");
    }
    const charged = await chargeOnce(cafeId);
    return redirect(base, charged.ok, charged.ok ? "charged" : (charged.reason || "charge_failed"));
  } catch {
    return redirect(base, false, "error");
  }
}
